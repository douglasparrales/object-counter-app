"""Exporta el detector abierto YOLOE para el modo AR.

Ejecutar desde object-counter-app con un Python que tenga ultralytics:
    python scripts/export_ar_model.py
"""
from pathlib import Path
import shutil

from ultralytics import YOLOE


ROOT = Path(__file__).resolve().parents[1]
DESTINO = ROOT / "android" / "app" / "src" / "main" / "assets" / "yoloe-26n.onnx"


def main():
    modelo = YOLOE("yoloe-26n-seg.pt")
    exportado = Path(modelo.export(format="onnx", imgsz=640, nms=True, opset=19, simplify=False))
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(exportado, DESTINO)
    print(f"Modelo AR creado: {DESTINO}")


if __name__ == "__main__":
    main()
