"""Optional monitor experiment; activation is explicit and weights load once."""
from pathlib import Path
from threading import Lock
import math
import time
import unicodedata

from services.static_counter import StaticImageCounter


def is_monitor_target(value: str) -> bool:
    name = ''.join(c for c in unicodedata.normalize('NFD', value.strip().lower())
                   if unicodedata.category(c) != 'Mn')
    # Do not reuse COCO's tv/screen aliases: our training excludes televisions.
    return name in {'monitor', 'monitores', 'computer monitor', 'computer monitors'}


def monitor_requested(label: str, reference: dict | None = None) -> bool:
    # /identify's legacy COCO label merges TVs and monitors. Preserve the user's
    # original request across the session instead of inferring intent from it.
    return is_monitor_target(reference.get('objetivo_original', label) if reference else label)


def soft_nms(rows, confidence, sigma=0.5):
    """Gaussian Soft-NMS discounts weaker overlapping hypotheses.

    Input rows are xyxy, confidence, class. Unlike an extra hard intersection
    cutoff, a real overlapping monitor with strong evidence can survive.
    Returns original indices and adjusted scores, without modifying input.
    """
    pending = [(i, float(row[4])) for i, row in enumerate(rows)]
    kept = []
    while pending:
        pending.sort(key=lambda item: (-item[1], item[0]))
        index, score = pending.pop(0)
        if score < confidence:
            break
        kept.append((index, score))
        a = rows[index]
        updated = []
        for other, candidate_score in pending:
            b = rows[other]
            intersection = max(0, min(a[2],b[2])-max(a[0],b[0])) * max(0, min(a[3],b[3])-max(a[1],b[1]))
            union = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - intersection
            iou = intersection / max(union, 1e-9)
            updated.append((other, candidate_score * math.exp(-(iou*iou)/sigma)))
        pending = updated
    return kept


class MonitorCounter:
    # Keep the detector's calibrated threshold in both paths. The extra 0.35
    # cutoff formerly applied only to live frames also removed real overlaps.
    NMS_IOU = 0.45

    def __init__(self, weights: str, confidence: float = 0.7, imgsz: int = 640):
        from ultralytics import YOLO
        path = Path(weights).resolve(strict=True)
        self.model = YOLO(str(path))
        if self.model.names != {0: 'monitor'}:
            raise ValueError('MONITOR_MODEL_PATH must contain the single class monitor')
        self.lock = Lock()
        self.version = path.parent.parent.name
        if not 0 < confidence < 1 or imgsz < 32 or imgsz % 32:
            raise ValueError('Invalid monitor inference settings')
        self.confidence, self.imgsz = confidence, imgsz

    def predict(self, image):
        with self.lock:
            results = self.model.predict(image, imgsz=self.imgsz, conf=self.confidence, iou=self.NMS_IOU, classes=[0],
                                         device='cpu', verbose=False)
            for result in results:
                rows = result.boxes.data
                kept = soft_nms(rows.tolist(), self.confidence)
                filtered = rows[[index for index, _ in kept]].clone()
                for index, (_, score) in enumerate(kept):
                    filtered[index, 4] = score
                result.update(boxes=filtered)
            return results

    def contar(self, image, objetivo='', seleccion=None):
        start = time.monotonic()
        predictions = []
        for result in self.predict(image):
            for box in result.boxes:
                predictions.append(('monitor', float(box.conf[0]), tuple(float(v) for v in box.xyxy[0])))
        width, height = image.size
        objects = [dict(id=i+1, clase=name, confianza=round(conf, 3),
                        cx=(x1+x2)/2/width, cy=(y1+y2)/2/height,
                        w=(x2-x1)/width, h=(y2-y1)/height)
                   for i, (name, conf, (x1,y1,x2,y2)) in enumerate(predictions)]
        return dict(total=len(objects), resumen={'monitor': len(objects)}, objetos=objects,
                    imagen_anotada_base64=StaticImageCounter._anotar(image, predictions),
                    imagen_mosaicos_base64=StaticImageCounter._anotar_mosaicos(image, [(0,0,width,height)]),
                    diagnostico=dict(mosaicos=1, candidatos_generales=0, candidatos_dirigidos=len(objects),
                                     candidatos_apariencia=0, ruta='monitor_experimental',
                                     modelo_version=self.version, duracion_segundos=round(time.monotonic()-start,3)))
