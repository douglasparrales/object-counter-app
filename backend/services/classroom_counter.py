"""Explicitly enabled two-class classroom candidate; never overwrites weights."""
from pathlib import Path
from threading import Lock
import time
import unicodedata

from services.monitor_counter import is_monitor_target
from services.static_counter import StaticImageCounter


def classroom_target(label, reference=None):
    value = reference.get('objetivo_original', label) if reference else label
    if is_monitor_target(value):
        return 'monitor'
    value = ''.join(c for c in unicodedata.normalize('NFD', value.strip().lower())
                    if unicodedata.category(c) != 'Mn')
    if value in {'mouse', 'mouses', 'mice', 'raton', 'ratones', 'computer mouse', 'computer mice'}:
        return 'mouse'
    return None


class ClassroomCounter:
    def __init__(self, weights, monitor_confidence, mouse_confidence, imgsz=640):
        from ultralytics import YOLO
        self.confidences = {'monitor': float(monitor_confidence), 'mouse': float(mouse_confidence)}
        if any(not 0.15 <= c < 1 for c in self.confidences.values()) or imgsz < 32 or imgsz % 32:
            raise ValueError('Invalid classroom inference settings')
        path = Path(weights).resolve(strict=True)
        self.model = YOLO(str(path))
        if self.model.names != {0: 'monitor', 1: 'mouse'}:
            raise ValueError('Classroom checkpoint must contain monitor=0 and mouse=1')
        self.version, self.imgsz = path.parent.parent.name, imgsz
        self.lock = Lock()

    def supports(self, label, reference=None):
        return classroom_target(label, reference) is not None

    def predict(self, image, objetivo):
        target = classroom_target(objetivo)
        if target is None:
            raise ValueError('Unsupported classroom target')
        with self.lock:
            return self.model.predict(image, imgsz=self.imgsz, conf=self.confidences[target],
                iou=0.45, classes=[0 if target == 'monitor' else 1], device='cpu', verbose=False)

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
