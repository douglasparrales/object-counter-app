from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from PIL import Image
import io

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Carga el modelo una sola vez al iniciar
model = YOLO("yolov8n.pt")

@app.post("/detect")
async def detect(file: UploadFile = File(...)):
    print("================================")
    print("📥 PETICIÓN RECIBIDA")

    contents = await file.read()

    print(f"📷 Tamaño: {len(contents)} bytes")

    image = Image.open(io.BytesIO(contents)).convert("RGB")

    print("🤖 Ejecutando YOLO...")

    results = model(image, conf=0.45, verbose=False)

    print("✅ Detección completada")

    conteo = {}

    for result in results:
        for box in result.boxes:
            clase = model.names[int(box.cls[0])]
            print("Objeto:", clase)

            conf = float(box.conf[0])

            if clase not in conteo:
                conteo[clase] = {
                    "cantidad": 0,
                    "confianza_total": 0
                }

            conteo[clase]["cantidad"] += 1
            conteo[clase]["confianza_total"] += conf

    print("✅ Respuesta enviada")
    print("================================")

    return {
        "detecciones": [
            {
                "clase": clase,
                "cantidad": datos["cantidad"],
                "confianza": round(
                    datos["confianza_total"] /
                    datos["cantidad"],
                    3
                ),
            }
            for clase, datos in conteo.items()
        ]
    }