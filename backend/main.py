from fastapi import FastAPI, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLOWorld  # ← Usamos YOLO-World (Opción A)
from PIL import Image
import io, time

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Carga el modelo YOLO-World
model = YOLOWorld("yolov8s-worldv2.pt")

# IDs que ya fueron contados en esta sesión
ids_contados = set()
ultimo_reset = time.time()

@app.post("/reset")
async def reset_session():
    global ids_contados, ultimo_reset
    ids_contados = set()
    ultimo_reset = time.time()
    print("🔄 Sesión reiniciada")
    return {"ok": True}

@app.post("/detect")
async def detect(
    file: UploadFile = File(...),
    clase_filtro: str = Query(default="")
):
    print("📥 Petición de detección recibida")
    global ids_contados

    # Si el usuario mandó un filtro (ej: "lemon", "pen", "mouse"), 
    # reconfiguramos YOLO-World en tiempo real
    if clase_filtro.strip():
        model.set_classes([clase_filtro.strip()])
    else:
        # Clases de prueba si no hay filtro activo
        model.set_classes(["lemon", "pen", "keyboard", "mouse", "apple", "person"])

    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")

    results = model.track(
        image,
        conf=0.15,  # Bajamos un poco la confianza para detectar mejor objetos pequeños
        iou=0.4,
        imgsz=320,
        persist=True,
        tracker="bytetrack.yaml",
        verbose=False
    )

    detecciones = []
    nuevos = 0

    for result in results:
        boxes = result.boxes
        ids = boxes.id if boxes.id is not None else range(len(boxes))

        for i, box in enumerate(boxes):
            clase = model.names[int(box.cls[0])]
            
            tid = int(ids[i]) if boxes.id is not None else (hash(f"{clase}_{i}_{len(ids_contados)}") % 100000)
            conf = float(box.conf[0])
            x1, y1, x2, y2 = box.xyxyn[0].tolist()
            cx = (x1 + x2) / 2
            cy = (y1 + y2) / 2
            ya_contado = tid in ids_contados

            if not ya_contado:
                ids_contados.add(tid)
                nuevos += 1

            detecciones.append({
                "clase":       clase,
                "confianza":   round(conf, 3),
                "cx":          round(cx, 4),
                "cy":          round(cy, 4),
                "w":           round(x2 - x1, 4),
                "h":           round(y2 - y1, 4),
                "track_id":    tid,
                "ya_contado":  ya_contado,
            })

    total = len(ids_contados)
    print(f"✅ Filtro: {clase_filtro} | Nuevos: {nuevos} | Total: {total} | Detecciones: {len(detecciones)}")

    return {
        "detecciones": detecciones,
        "total_contado": total,
    }

@app.post("/identify")
async def identify(file: UploadFile = File(...)):
    print("🔍 Identificando objeto de referencia...")
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    
    # Para la identificación genérica, le damos un set amplio de objetos cotidianos
    model.set_classes(["lemon", "pen", "keyboard", "mouse", "apple", "bottle", "cup", "cell phone", "person"])
    
    results = model(image, conf=0.15, verbose=False)

    mejor = None
    mejor_conf = 0
    for result in results:
        for box in result.boxes:
            conf = float(box.conf[0])
            if conf > mejor_conf:
                mejor_conf = conf
                mejor = model.names[int(box.cls[0])]

    if not mejor:
        return {"clase": None, "mensaje": "No se reconoció ningún objeto"}
    
    print(f"💡 Objeto identificado: {mejor} ({round(mejor_conf, 3)})")
    return {"clase": mejor, "confianza": round(mejor_conf, 3)}