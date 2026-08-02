from fastapi import FastAPI, UploadFile, File, Query
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

print("🤖 Cargando YOLO...")
model = YOLO("yolov8n.pt")
print("✅ YOLO listo")


@app.post("/detect")
async def detect(
    file: UploadFile = File(...),
    clase_filtro: str = Query(default="")
):
    print(f"📥 /detect | filtro={clase_filtro or 'ninguno'}")

    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")

    results = model(
        image,
        conf=0.30,
        iou=0.5,
        verbose=False
    )

    conteo = {}

    for result in results:
        for box in result.boxes:
            clase = model.names[int(box.cls[0])]

            if clase_filtro and clase != clase_filtro:
                continue

            conf = float(box.conf[0])

            if clase not in conteo:
                conteo[clase] = {
                    "cantidad": 0,
                    "confianza_total": 0
                }

            conteo[clase]["cantidad"] += 1
            conteo[clase]["confianza_total"] += conf

    total = sum(x["cantidad"] for x in conteo.values())
    print(f"✅ Objetos detectados: {total}")

    return {
        "detecciones": [
            {
                "clase": clase,
                "cantidad": datos["cantidad"],
                "confianza": round(
                    datos["confianza_total"] / datos["cantidad"],
                    3,
                ),
            }
            for clase, datos in conteo.items()
        ]
    }


@app.post("/identify")
async def identify(file: UploadFile = File(...)):
    print("📥 /identify")

    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")

    results = model(
        image,
        conf=0.20,
        verbose=False
    )

    mejor_deteccion = None
    mejor_confianza = 0

    for result in results:
        for box in result.boxes:
            conf = float(box.conf[0])

            if conf > mejor_confianza:
                mejor_confianza = conf
                mejor_deteccion = model.names[int(box.cls[0])]

    if not mejor_deteccion:
        print("⚠️ Sin detecciones")
        return {
            "clase": None,
            "mensaje": "No se reconoció ningún objeto"
        }

    print(
        f"✅ Identificado: {mejor_deteccion} ({mejor_confianza:.2f})"
    )

    return {
        "clase": mejor_deteccion,
        "confianza": round(mejor_confianza, 3)
    }