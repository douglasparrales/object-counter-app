"""Explicitly enabled versioned classroom candidate; never overwrites weights."""
import hashlib
from pathlib import Path
from threading import Lock
import time
import unicodedata

from services.monitor_counter import is_monitor_target, soft_nms
from services.static_counter import StaticImageCounter


def classroom_target(label, reference=None):
    value = reference.get('objetivo_original', label) if reference else label
    if is_monitor_target(value):
        return 'monitor'
    value = ''.join(c for c in unicodedata.normalize('NFD', value.strip().lower())
                    if unicodedata.category(c) != 'Mn')
    if value in {'mouse', 'mouses', 'mice', 'raton', 'ratones', 'computer mouse', 'computer mice'}:
        return 'mouse'
    if value in {'teclado', 'teclados', 'keyboard', 'keyboards', 'computer keyboard'}:
        return 'keyboard'
    return None


def merge_mouse_indices(previous, current):
    """Keep prior detections and add spatially distinct candidates from the new model."""
    rows=previous+current
    kept=list(range(len(previous)))
    for index in range(len(previous),len(rows)):
        a=rows[index]; area=max(0,a[2]-a[0])*max(0,a[3]-a[1])
        duplicate=False
        for j in kept:
            b=rows[j];other=max(0,b[2]-b[0])*max(0,b[3]-b[1])
            overlap=max(0,min(a[2],b[2])-max(a[0],b[0]))*max(0,min(a[3],b[3])-max(a[1],b[1]))
            if overlap/max(1e-9,area+other-overlap)>=.35 or overlap/max(1e-9,min(area,other))>=.8:
                duplicate=True;break
        if not duplicate:kept.append(index)
    return kept


class ClassroomCounter:
    def __init__(self, weights, monitor_confidence, mouse_confidence, imgsz=640, keyboard_confidence=0.5, keyboard_soft_nms_sigma=None, mouse_previous_weights=None, mouse_previous_confidence=.85, preserve_previous_monitor=False):
        from ultralytics import YOLO
        self.confidences = {'monitor': float(monitor_confidence), 'mouse': float(mouse_confidence), 'keyboard': float(keyboard_confidence)}
        if any(not 0.15 <= c < 1 for c in self.confidences.values()) or imgsz < 32 or imgsz % 32:
            raise ValueError('Invalid classroom inference settings')
        if keyboard_soft_nms_sigma is not None and not 0 < keyboard_soft_nms_sigma <= 10:
            raise ValueError('Invalid keyboard Soft-NMS sigma')
        self.keyboard_soft_nms_sigma = keyboard_soft_nms_sigma
        path = Path(weights).resolve(strict=True)
        self.model = YOLO(str(path))
        if self.model.names not in ({0: 'monitor', 1: 'mouse'}, {0: 'monitor', 1: 'mouse', 2: 'keyboard'}):
            raise ValueError('Classroom checkpoint must contain monitor=0, mouse=1 and optionally keyboard=2')
        self.version = f'{path.stem}:{hashlib.sha256(path.read_bytes()).hexdigest()[:12]}'
        self.imgsz = imgsz
        self.previous_model = None
        self.mouse_previous_confidence = float(mouse_previous_confidence)
        if not .15 <= self.mouse_previous_confidence < 1:
            raise ValueError('Invalid previous mouse confidence')
        if mouse_previous_weights:
            previous_path=Path(mouse_previous_weights).resolve(strict=True)
            self.previous_model=YOLO(str(previous_path))
            if self.previous_model.names != {0:'monitor',1:'mouse'}:
                raise ValueError('Previous mouse checkpoint must contain monitor=0 and mouse=1')
            self.version += f'+previous:{hashlib.sha256(previous_path.read_bytes()).hexdigest()[:12]}'
        self.preserve_previous_monitor = preserve_previous_monitor
        if preserve_previous_monitor and self.previous_model is None:
            raise ValueError('Preserving monitors requires the previous classroom checkpoint')
        self.lock = Lock()

    def supports(self, label, reference=None):
        return classroom_target(label, reference) in self.model.names.values()

    def predict(self, image, objetivo):
        target = classroom_target(objetivo)
        if target not in self.model.names.values():
            raise ValueError('Unsupported classroom target')
        with self.lock:
            detector=self.previous_model if target=='monitor' and self.preserve_previous_monitor else self.model
            results = detector.predict(image, imgsz=self.imgsz, conf=self.confidences[target],
                iou=0.45, classes=[next(k for k,v in detector.names.items() if v == target)], device='cpu', verbose=False)
            if target == 'mouse' and self.previous_model is not None:
                import torch
                previous=self.previous_model.predict(image,imgsz=self.imgsz,conf=self.mouse_previous_confidence,
                    iou=.45,classes=[1],device='cpu',verbose=False)
                for result,old in zip(results,previous):
                    old_rows,new_rows=old.boxes.data,result.boxes.data
                    indices=merge_mouse_indices(old_rows.tolist(),new_rows.tolist())
                    result.update(boxes=torch.cat((old_rows,new_rows),dim=0)[indices])
            if target == 'keyboard' and self.keyboard_soft_nms_sigma is not None:
                for result in results:
                    rows = result.boxes.data
                    kept = soft_nms(rows.tolist(), self.confidences[target], self.keyboard_soft_nms_sigma)
                    filtered = rows[[index for index, _ in kept]].clone()
                    for index, (_, score) in enumerate(kept):
                        filtered[index, 4] = score
                    result.update(boxes=filtered)
            return results

    def contar(self, image, objetivo='', seleccion=None):
        start = time.monotonic()
        target = classroom_target(objetivo)
        predictions = [(target, float(b.conf[0]), tuple(float(v) for v in b.xyxy[0]))
                       for r in self.predict(image, objetivo) for b in r.boxes]
        width, height = image.size
        objects = [dict(id=i+1, clase=name, confianza=round(conf,3),cx=(x1+x2)/2/width,
                        cy=(y1+y2)/2/height,w=(x2-x1)/width,h=(y2-y1)/height)
                   for i,(name,conf,(x1,y1,x2,y2)) in enumerate(predictions)]
        return dict(total=len(objects),resumen={target:len(objects)},objetos=objects,
            imagen_anotada_base64=StaticImageCounter._anotar(image,predictions),
            imagen_mosaicos_base64=StaticImageCounter._anotar_mosaicos(image,[(0,0,width,height)]),
            diagnostico=dict(mosaicos=1,candidatos_generales=0,candidatos_dirigidos=len(objects),
                candidatos_apariencia=0,ruta='aula_experimental',modelo_version=self.version,
                duracion_segundos=round(time.monotonic()-start,3)))
