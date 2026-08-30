"""Exporta el modelo YOLOE RepRTA usado por el conteo AR en Android.

Ejecutar desde la raíz del repositorio con el entorno del backend activo:
    python backend/tools/export_ar_model.py

La exportación descarga pesos la primera vez y deja el ONNX directamente en
los assets nativos. Después es necesario reconstruir la aplicación Android.
"""

from pathlib import Path
import shutil

from ultralytics import YOLOE


CLASES_AR = [
    "person",
    "ballpoint pen",
    "pen",
    "pencil",
    "keyboard",
    "computer mouse",
    "mouse",
    "cell phone",
    "mobile phone",
    "laptop",
    "monitor",
    "remote control",
    "headphones",
    "camera",
    "book",
    "scissors",
    "key",
    "cup",
    "mug",
    "bottle",
    "plate",
    "bowl",
    "fork",
    "knife",
    "spoon",
    "coin",
    "ball",
    "box",
    "can",
]

RAIZ = Path(__file__).resolve().parents[2]
DESTINO_PROYECTO = RAIZ / "object-counter-app" / "assets" / "models" / "yoloe-counter-ar.onnx"
DESTINO_ANDROID = RAIZ / "object-counter-app" / "android" / "app" / "src" / "main" / "assets" / "models" / "yoloe-counter-ar.onnx"


def main() -> None:
    print(f"[AR export] Preparando {len(CLASES_AR)} clases dirigidas...")
    modelo = YOLOE("yoloe-26n-seg.pt")
    modelo.set_classes(CLASES_AR, modelo.get_text_pe(CLASES_AR))
    generado = Path(modelo.export(
        format="onnx",
        imgsz=640,
        nms=True,
        opset=19,
        simplify=False,
    )).resolve()
    for destino in (DESTINO_PROYECTO, DESTINO_ANDROID):
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(generado, destino)
        print(f"[AR export] Modelo listo en: {destino}")


if __name__ == "__main__":
    main()
