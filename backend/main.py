from fastapi import FastAPI, File, UploadFile, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLOWorld
from deep_translator import GoogleTranslator
import io
import time
import traceback
from PIL import Image

app = FastAPI(title="Object Counter AR Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("\n--------------------------------------------------")
print("🚀 [INICIO] Cargando modelo YOLO-World...")
try:
    model = YOLOWorld("yolov8s-world.pt")
    print("✅ [INICIO] Modelo YOLO-World cargado con éxito.")
except Exception as e:
    print(f"💥 [ERROR CRÍTICO] Falló la carga del modelo YOLO-World: {e}")
    traceback.print_exc()
print("--------------------------------------------------\n")


def traducir_a_ingles(palabra_es: str) -> str:
    """Traduce la palabra en español a inglés para que YOLO-World la entienda mejor."""
    if not palabra_es:
        return palabra_es
    try:
        traduccion = GoogleTranslator(source="es", target="en").translate(palabra_es)
        res = traduccion.strip().lower() if traduccion else palabra_es
        print(f"🌐 [TRADUCCIÓN] '{palabra_es}' -> '{res}'")
        return res
    except Exception as e:
        print(f"⚠️ [TRADUCCIÓN FALLIDA] No se pudo traducir '{palabra_es}' (se usará original). Error: {e}")
        return palabra_es


@app.post("/identify")
async def identify(
    file: UploadFile = File(...),
    prompt: str = Query(default="")  # Llega en ESPAÑOL, ej: "tomate"
):
    t0 = time.time()
    print(f"\n📥 [/identify] Nueva petición recibida | Imagen: '{file.filename}' | Prompt: '{prompt}'")

    # 1. Cargar e interpretar la imagen
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        print(f"🖼️ [/identify] Imagen cargada correctamente. Dimensiones: {image.size[0]}x{image.size[1]}px")
    except Exception as e:
        print(f"❌ [/identify ERROR] Error al abrir/procesar la imagen enviada: {e}")
        raise HTTPException(status_code=400, detail="No se pudo leer la imagen enviada.")

    # 2. Preparar clases para YOLO
    prompt_es = prompt.strip().lower()
    prompt_en = traducir_a_ingles(prompt_es)

    candidatos = []
    for c in [prompt_en, prompt_es]:
        if c and c not in candidatos:
            candidatos.append(c)
    if not candidatos:
        candidatos = ["object", "item", "thing"]

    print(f"🎯 [/identify] Clases enviadas a YOLO: {candidatos}")

    # 3. Correr la inferencia en YOLO
    try:
        model.set_classes(candidatos)
        results = model(image, conf=0.15, verbose=False)
    except Exception as e:
        print(f"❌ [/identify ERROR] Fallo durante la Inferencia con YOLO-World: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error interno identificando el objeto.")

    # 4. Procesar los resultados
    mejor_conf = 0.0
    clase_detectada = None

    for result in results:
        for box in result.boxes:
            conf = float(box.conf[0])
            if conf > mejor_conf:
                mejor_conf = conf
                clase_detectada = model.names[int(box.cls[0])]

    duracion = round(time.time() - t0, 3)

    # 5. Evaluación de resultados
    if not clase_detectada or mejor_conf < 0.15:
        print(f"⚠️ [/identify RESULTADO] Objeto '{prompt_es}' NO encontrado. Máxima confianza: {round(mejor_conf, 3)} | Tiempo: {duracion}s")
        return {
            "exito": False,
            "clase": prompt_es or "desconocido",
            "traduccion": prompt_en,
            "confianza": round(mejor_conf, 3),
            "mensaje": f"No se pudo confirmar la presencia de '{prompt_es}' en la imagen."
        }

    print(f"💡 [/identify RESULTADO] ÉXITO -> Detectado: '{clase_detectada}' con confianza {round(mejor_conf, 3)} | Tiempo: {duracion}s")
    return {
        "exito": True,
        "clase": clase_detectada,
        "traduccion": prompt_en,
        "confianza": round(mejor_conf, 3)
    }


@app.post("/detect")
async def detect(
    file: UploadFile = File(...),
    clase_filtro: str = Query(default="")  # Viene en INGLÉS, ej: "tomato"
):
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception as e:
        print(f"❌ [/detect ERROR] Error leyendo la imagen del frame: {e}")
        raise HTTPException(status_code=400, detail="No se pudo leer la imagen enviada.")

    img_w, img_h = image.size
    clase = clase_filtro.strip().lower()
    candidatos = [clase] if clase else ["object", "item", "thing"]

    try:
        model.set_classes(candidatos)
        results = model(image, conf=0.2, verbose=False)
    except Exception as e:
        print(f"❌ [/detect ERROR] Fallo en la inferencia del loop: {e}")
        return {"objetos": []}

    objetos = []
    for result in results:
        for box in result.boxes:
            conf = float(box.conf[0])
            if conf < 0.2:
                continue

            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
            cx = ((x1 + x2) / 2) / img_w
            cy = ((y1 + y2) / 2) / img_h
            w  = (x2 - x1) / img_w
            h  = (y2 - y1) / img_h
            clase_nombre = model.names[int(box.cls[0])]

            objetos.append({
                "clase": clase_nombre,
                "cx": round(cx, 4),
                "cy": round(cy, 4),
                "w": round(w, 4),
                "h": round(h, 4),
                "confianza": round(conf, 3),
            })

    # Imprime un resumen corto en una sola línea por cada frame
    print(f"🔍 [/detect] Filtro: '{clase}' | Objetos detectados: {len(objetos)}")

    return {"objetos": objetos}