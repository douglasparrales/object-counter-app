from fastapi import FastAPI, File, UploadFile, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO, YOLOWorld
from routes.static_count import crear_router as crear_router_conteo_estatico
from services.static_counter import StaticImageCounter
from services.visual_reference import crear_perfil_visual, detectar_por_perfil
from deep_translator import GoogleTranslator
import io
import time
import traceback
import unicodedata
import uuid
from threading import Lock
from PIL import Image, ImageOps
import cv2
import numpy as np

app = FastAPI(title="Object Counter AR Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("\n--------------------------------------------------")
print("🚀 [INICIO] Cargando modelo YOLO-World v2...")
try:
    # El checkpoint v2 ya está incluido en backend y entiende mejor prompts abiertos.
    model = YOLOWorld("yolov8s-worldv2.pt")
    model_general = YOLO("yolov8n.pt")
    print("✅ [INICIO] Modelo YOLO-World cargado con éxito.")
except Exception as e:
    print(f"💥 [ERROR CRÍTICO] Falló la carga del modelo YOLO-World: {e}")
    traceback.print_exc()
print("--------------------------------------------------\n")

# set_classes modifica el estado del modelo. El lock evita que dos peticiones
# simultáneas usen las clases de otra petición.
model_lock = Lock()
clases_activas: tuple[str, ...] | None = None
referencias_visuales: dict[str, dict] = {}
traducciones_cache: dict[str, str] = {}
MAX_REFERENCIAS_EN_MEMORIA = 30
ORB = cv2.ORB_create(nfeatures=800)

# Google Translate traduce "esfero" como "sphere", pero en Colombia/Ecuador
# normalmente significa bolígrafo. Aquí se conservan los términos que YOLO usa.
ALIASES_YOLO = {
    "esfero": ["ballpoint pen", "pen"],
    "boligrafo": ["ballpoint pen", "pen"],
    "lapicero": ["ballpoint pen", "pen"],
    "pluma": ["pen"],
    "marcador": ["marker pen", "marker"],
    "mouse": ["computer mouse", "mouse"],
    "raton": ["computer mouse", "mouse"],
    "teclado": ["computer keyboard", "keyboard"],
    "telefono": ["cell phone", "smartphone", "phone"],
    "celular": ["cell phone", "smartphone", "phone"],
    "persona": ["person"],
    "personas": ["person"],
}

# Categorías adicionales para la foto directa cuando COCO no detecta nada.
CATEGORIAS_FOTO_DIRECTA = [
    "pen", "pencil", "screw", "bolt", "nut", "coin", "candy", "marble",
    "ball", "bottle", "cup", "book", "key", "phone", "scissors", "fruit",
]


def normalizar(texto: str) -> str:
    texto = unicodedata.normalize("NFD", texto.strip().lower())
    return "".join(caracter for caracter in texto if unicodedata.category(caracter) != "Mn")


def obtener_candidatos(prompt: str) -> tuple[str, list[str]]:
    """Convierte el nombre del usuario en etiquetas en inglés para YOLO-World."""
    prompt_normalizado = normalizar(prompt)
    candidatos = list(ALIASES_YOLO.get(prompt_normalizado, []))
    traduccion = traducir_a_ingles(prompt_normalizado) if prompt_normalizado else ""

    # YOLO-World está entrenado principalmente con etiquetas en inglés; no se
    # envía el término en español porque suele reducir la precisión.
    if traduccion and traduccion not in candidatos and (traduccion != prompt_normalizado or not candidatos):
        candidatos.append(traduccion)

    if not candidatos:
        candidatos = ["object", "item"]

    return traduccion, candidatos


def ejecutar_inferencia(image: Image.Image, candidatos: list[str], confianza: float, imgsz: int):
    """Ejecuta YOLO de forma serializada porque set_classes es global al modelo."""
    global clases_activas
    with model_lock:
        nuevas_clases = tuple(candidatos)
        if clases_activas != nuevas_clases:
            print(f"[YOLO] Configurando clases: {candidatos}")
            model.set_classes(candidatos)
            clases_activas = nuevas_clases
        else:
            print("[YOLO] Reutilizando clases ya configuradas.")
        return model(image, conf=confianza, imgsz=imgsz, verbose=False)


def recortar_imagen(image: Image.Image, caja: tuple[float, float, float, float] | None = None) -> Image.Image:
    if caja is None:
        return image
    x1, y1, x2, y2 = caja
    ancho, alto = image.size
    margen_x, margen_y = (x2 - x1) * 0.08, (y2 - y1) * 0.08
    return image.crop((max(0, x1 - margen_x), max(0, y1 - margen_y), min(ancho, x2 + margen_x), min(alto, y2 + margen_y)))


def crear_descriptor_visual(image: Image.Image) -> dict:
    """Firma de color y textura para comparar una detección con la referencia."""
    matriz = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR)
    matriz = cv2.resize(matriz, (160, 160), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(matriz, cv2.COLOR_BGR2HSV)
    histograma = cv2.calcHist([hsv], [0, 1, 2], None, [12, 8, 8], [0, 180, 0, 256, 0, 256])
    cv2.normalize(histograma, histograma)
    _, descriptores = ORB.detectAndCompute(cv2.cvtColor(matriz, cv2.COLOR_BGR2GRAY), None)
    return {"histograma": histograma, "descriptores": descriptores}


def similitud_visual(referencia: dict, candidato: Image.Image) -> float:
    descriptor = crear_descriptor_visual(candidato)
    distancia_hist = cv2.compareHist(referencia["histograma"], descriptor["histograma"], cv2.HISTCMP_BHATTACHARYYA)
    similitud_color = max(0.0, min(1.0, 1.0 - distancia_hist))
    ref_orb, cand_orb = referencia["descriptores"], descriptor["descriptores"]
    similitud_orb = 0.0
    if ref_orb is not None and cand_orb is not None and len(ref_orb) >= 2 and len(cand_orb) >= 2:
        parejas = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(ref_orb, cand_orb, k=2)
        buenas = sum(1 for pareja in parejas if len(pareja) == 2 and pareja[0].distance < 0.75 * pareja[1].distance)
        similitud_orb = min(1.0, buenas / 12)
    return round(0.60 * similitud_color + 0.40 * similitud_orb, 3)


def guardar_referencia_visual(image: Image.Image, caja: tuple[float, float, float, float] | None) -> str:
    referencia_id = str(uuid.uuid4())
    referencias_visuales[referencia_id] = {
        "descriptor": crear_descriptor_visual(recortar_imagen(image, caja)),
        # Si YOLO no localizó la referencia, su foto incluye fondo además del
        # objeto: compararla contra una caja genera falsos negativos.
        "usar_similitud": caja is not None,
        "perfil_apariencia": crear_perfil_visual(image, caja) if caja is not None else None,
    }
    while len(referencias_visuales) > MAX_REFERENCIAS_EN_MEMORIA:
        referencias_visuales.pop(next(iter(referencias_visuales)))
    print(f"[REFERENCIA] Firma visual guardada: {referencia_id[:8]}...")
    return referencia_id


def iou_cajas(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    interseccion = max(0, min(ax2, bx2) - max(ax1, bx1)) * max(0, min(ay2, by2) - max(ay1, by1))
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - interseccion
    return interseccion / union if union > 0 else 0.0


def traducir_a_ingles(palabra_es: str) -> str:
    """Traduce la palabra en español a inglés para que YOLO-World la entienda mejor."""
    if not palabra_es:
        return palabra_es
    if palabra_es in traducciones_cache:
        return traducciones_cache[palabra_es]
    if palabra_es.isascii() and all(caracter.isalpha() or caracter in " -" for caracter in palabra_es):
        traducciones_cache[palabra_es] = palabra_es
        return palabra_es
    try:
        traduccion = GoogleTranslator(source="es", target="en").translate(palabra_es)
        res = traduccion.strip().lower() if traduccion else palabra_es
        print(f"🌐 [TRADUCCIÓN] '{palabra_es}' -> '{res}'")
        traducciones_cache[palabra_es] = res
        return res
    except Exception as e:
        print(f"⚠️ [TRADUCCIÓN FALLIDA] No se pudo traducir '{palabra_es}' (se usará original). Error: {e}")
        traducciones_cache[palabra_es] = palabra_es
        return palabra_es


@app.post("/identify")
async def identify(
    file: UploadFile = File(...),
    prompt: str = Query(default=""),
    seleccion_x: float | None = Query(default=None),
    seleccion_y: float | None = Query(default=None),
    seleccion_w: float | None = Query(default=None),
    seleccion_h: float | None = Query(default=None),
):
    t0 = time.time()
    print(f"\n📥 [/identify] Nueva petición recibida | Imagen: '{file.filename}' | Prompt: '{prompt}'")

    # 1. Cargar e interpretar la imagen
    try:
        contents = await file.read()
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(contents))).convert("RGB")
        print(f"🖼️ [/identify] Imagen cargada correctamente. Dimensiones: {image.size[0]}x{image.size[1]}px")
    except Exception as e:
        print(f"❌ [/identify ERROR] Error al abrir/procesar la imagen enviada: {e}")
        raise HTTPException(status_code=400, detail="No se pudo leer la imagen enviada.")

    # 2. Preparar clases para YOLO
    prompt_es = normalizar(prompt)
    prompt_en, candidatos = obtener_candidatos(prompt_es)
    seleccion = None
    valores_seleccion = (seleccion_x, seleccion_y, seleccion_w, seleccion_h)
    if any(valor is not None for valor in valores_seleccion) and not all(valor is not None for valor in valores_seleccion):
        raise HTTPException(status_code=422, detail="La selección visual está incompleta.")
    if all(valor is not None for valor in valores_seleccion):
        x, y, w, h = (float(valor) for valor in valores_seleccion)
        if w > 0 and h > 0 and x >= 0 and y >= 0 and x + w <= 1 and y + h <= 1:
            seleccion = (x * image.width, y * image.height, (x + w) * image.width, (y + h) * image.height)
        else:
            raise HTTPException(status_code=422, detail="La selección visual no es válida.")

    print(f"🎯 [/identify] Clases enviadas a YOLO: {candidatos}")

    # Una selección explícita es una referencia más fiable que intentar que
    # un vocabulario abierto reconozca primero objetos pequeños o regionalismos.
    if seleccion is not None:
        referencia_id = guardar_referencia_visual(image, seleccion)
        duracion = round(time.time() - t0, 3)
        clase_referencia = candidatos[0] if candidatos else (prompt_es or "objeto")
        print(f"✅ [/identify RESULTADO] Referencia visual seleccionada | Clase: '{clase_referencia}' | Tiempo: {duracion}s")
        return {
            "exito": True,
            "clase": clase_referencia,
            "traduccion": prompt_en,
            "confianza": 1.0,
            "referencia_id": referencia_id,
            "ruta": "seleccion_visual",
        }

    # 3. Correr la inferencia en YOLO
    try:
        print("🧠 [/identify] Iniciando inferencia (imgsz=640)...")
        results = ejecutar_inferencia(image, candidatos, confianza=0.10, imgsz=640)
    except Exception as e:
        print(f"❌ [/identify ERROR] Fallo durante la Inferencia con YOLO-World: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error interno identificando el objeto.")

    # 4. Procesar los resultados
    mejor_conf = 0.0
    clase_detectada = None
    mejor_caja = None

    for result in results:
        for box in result.boxes:
            conf = float(box.conf[0])
            if conf > mejor_conf:
                mejor_conf = conf
                clase_detectada = result.names[int(box.cls[0])]
                mejor_caja = tuple(float(valor) for valor in box.xyxy[0])

    duracion = round(time.time() - t0, 3)

    # 5. Evaluación de resultados
    if not clase_detectada or mejor_conf < 0.10:
        referencia_id = guardar_referencia_visual(image, seleccion)
        print(f"⚠️ [/identify RESULTADO] Objeto '{prompt_es}' NO encontrado. Máxima confianza: {round(mejor_conf, 3)} | Tiempo: {duracion}s")
        return {
            "exito": False,
            # Aunque la foto de referencia no se confirme, devolvemos la
            # etiqueta inglesa que usará YOLO en los frames posteriores.
            "clase": candidatos[0] if candidatos else (prompt_es or "desconocido"),
            "traduccion": prompt_en,
            "confianza": round(mejor_conf, 3),
            "referencia_id": referencia_id,
            "mensaje": f"No se pudo confirmar la presencia de '{prompt_es}' en la imagen."
        }

    print(f"💡 [/identify RESULTADO] ÉXITO -> Detectado: '{clase_detectada}' con confianza {round(mejor_conf, 3)} | Tiempo: {duracion}s")
    referencia_id = guardar_referencia_visual(image, seleccion or mejor_caja)
    return {
        "exito": True,
        "clase": clase_detectada,
        "traduccion": prompt_en,
        "confianza": round(mejor_conf, 3),
        "referencia_id": referencia_id,
    }


@app.post("/detect")
async def detect(
    file: UploadFile = File(...),
    clase_filtro: str = Query(default=""),
    referencia_id: str = Query(default=""),
    modo: str = Query(default="tiempo_real"),
):
    t0 = time.time()
    print(f"\n📥 [/detect] Nuevo frame | Filtro: '{clase_filtro}'")
    try:
        contents = await file.read()
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(contents))).convert("RGB")
    except Exception as e:
        print(f"❌ [/detect ERROR] Error leyendo la imagen del frame: {e}")
        raise HTTPException(status_code=400, detail="No se pudo leer la imagen enviada.")

    img_w, img_h = image.size
    clase = normalizar(clase_filtro)
    _, candidatos = obtener_candidatos(clase)
    referencia_registro = referencias_visuales.get(referencia_id)
    referencia = referencia_registro["descriptor"] if referencia_registro else None
    usar_similitud = bool(referencia_registro and referencia_registro["usar_similitud"])
    perfil_apariencia = referencia_registro.get("perfil_apariencia") if referencia_registro else None
    if referencia_id and referencia is None:
        print("[REFERENCIA] ID no disponible; se usará sólo el filtro de YOLO.")
    print(f"🎯 [/detect] Clases enviadas a YOLO: {candidatos}")

    candidatos_apariencia = detectar_por_perfil(image, perfil_apariencia, candidatos[0]) if perfil_apariencia else []
    try:
        # Una foto masiva conserva más detalle para objetos pequeños; el modo
        # tiempo real sigue siendo más rápido para la cámara en vivo.
        imgsz = 960 if modo == "foto_masiva" else 640
        results = [] if candidatos_apariencia else ejecutar_inferencia(image, candidatos, confianza=0.06, imgsz=imgsz)
    except Exception as e:
        print(f"❌ [/detect ERROR] Fallo en la inferencia del loop: {e}")
        return {"objetos": []}

    candidatos_detectados = [{
        "clase": nombre,
        "cx": round(((x1 + x2) / 2) / img_w, 4),
        "cy": round(((y1 + y2) / 2) / img_h, 4),
        "w": round((x2 - x1) / img_w, 4),
        "h": round((y2 - y1) / img_h, 4),
        "confianza": round(confianza, 3),
        "similitud_referencia": 1.0,
        "caja_px": (x1, y1, x2, y2),
    } for nombre, confianza, (x1, y1, x2, y2) in candidatos_apariencia]
    for result in results:
        for box in result.boxes:
            conf = float(box.conf[0])
            if conf < 0.15:
                continue

            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
            cx = ((x1 + x2) / 2) / img_w
            cy = ((y1 + y2) / 2) / img_h
            w  = (x2 - x1) / img_w
            h  = (y2 - y1) / img_h
            clase_nombre = result.names[int(box.cls[0])]

            similitud = similitud_visual(referencia, recortar_imagen(image, (x1, y1, x2, y2))) if referencia and usar_similitud else None
            # La foto de referencia suele incluir fondo y cambia de iluminación
            # frente al frame. Sólo descartamos diferencias muy marcadas.
            if similitud is not None and similitud < 0.25:
                print(f"[REFERENCIA] Caja descartada por similitud baja: {similitud}")
                continue

            candidatos_detectados.append({
                "clase": clase_nombre,
                "cx": round(cx, 4),
                "cy": round(cy, 4),
                "w": round(w, 4),
                "h": round(h, 4),
                "confianza": round(conf, 3),
                "similitud_referencia": similitud,
                "caja_px": (x1, y1, x2, y2),
            })

    # YOLO puede emitir varias cajas para el mismo objeto. Conservamos sólo la
    # de mayor confianza cuando se solapan; esto evita contar duplicados antes
    # de que el tracking del móvil reciba el frame.
    candidatos_detectados.sort(key=lambda item: item["confianza"], reverse=True)
    objetos = []
    for candidato in candidatos_detectados:
        caja_candidata = candidato.pop("caja_px")
        if any(iou_cajas(caja_candidata, existente["caja_px"]) >= 0.35 for existente in objetos):
            continue
        candidato["caja_px"] = caja_candidata
        objetos.append(candidato)
    for objeto in objetos:
        objeto.pop("caja_px")

    # Imprime un resumen corto en una sola línea por cada frame
    duracion = round(time.time() - t0, 3)
    ruta = "apariencia" if perfil_apariencia else "yolo"
    print(f"🔍 [/detect RESULTADO] Filtro: '{clase}' | Objetos: {len(objetos)} | Ruta: {ruta} | Tiempo: {duracion}s")

    return {"objetos": objetos}


def convertir_resultados(results) -> list[tuple[str, float, tuple[float, float, float, float]]]:
    predicciones = []
    for result in results:
        for box in result.boxes:
            predicciones.append((
                result.names[int(box.cls[0])],
                float(box.conf[0]),
                tuple(float(valor) for valor in box.xyxy[0]),
            ))
    return predicciones


def inferir_general_estatico(image: Image.Image, confianza: float, imgsz: int):
    with model_lock:
        return convertir_resultados(model_general(image, conf=confianza, imgsz=imgsz, verbose=False))


def inferir_abierto_estatico(image: Image.Image, confianza: float, imgsz: int, objetivo: str):
    _, candidatos = obtener_candidatos(objetivo) if objetivo else ("", CATEGORIAS_FOTO_DIRECTA)
    return convertir_resultados(
        ejecutar_inferencia(image, candidatos, confianza=confianza, imgsz=imgsz)
    )


contador_estatico = StaticImageCounter(inferir_general_estatico, inferir_abierto_estatico)
app.include_router(crear_router_conteo_estatico(contador_estatico))
