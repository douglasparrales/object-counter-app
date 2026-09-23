import cv2
import numpy as np
from PIL import Image


def crear_perfil_visual(image: Image.Image, caja: tuple[float, float, float, float]) -> dict:
    matriz = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR)
    hsv = cv2.cvtColor(matriz, cv2.COLOR_BGR2HSV)
    x1, y1, x2, y2 = (round(valor) for valor in caja)
    referencia = hsv[max(0, y1):max(y1 + 1, y2), max(0, x1):max(x1 + 1, x2)]
    pixeles = referencia.reshape(-1, 3)
    saturados = pixeles[pixeles[:, 1] >= max(45, np.percentile(pixeles[:, 1], 55))]
    if len(saturados) < 30:
        saturados = pixeles
    centro = np.median(saturados, axis=0)
    ancho, alto = max(1, x2 - x1), max(1, y2 - y1)
    # La caja de un bolígrafo diagonal es casi cuadrada. Medir su componente
    # orientada evita compararla después con el aspecto real (largo/delgado).
    tono = np.abs(referencia[:, :, 0].astype(np.float32) - centro[0])
    tono = np.minimum(tono, 180 - tono)
    mascara = ((tono <= 22) & (referencia[:, :, 1] >= max(45, centro[1] - 80)) &
               (np.abs(referencia[:, :, 2].astype(np.float32)-centro[2]) <= 100)).astype(np.uint8)*255
    contornos, _ = cv2.findContours(mascara, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    aspecto_ar = max(ancho / alto, alto / ancho)
    if contornos:
        lados = sorted(cv2.minAreaRect(max(contornos, key=cv2.contourArea))[1])
        if lados[0] >= 2:
            aspecto_ar = lados[1] / lados[0]
    return {
        "aspecto_ar": aspecto_ar,
        "centro_hsv": centro,
        "tolerancia_h": max(8, min(22, round(float(np.std(saturados[:, 0]) * 1.8)))),
        "tolerancia_s": max(45, min(100, round(float(np.std(saturados[:, 1]) * 2.2)))),
        "tolerancia_v": max(55, min(115, round(float(np.std(saturados[:, 2]) * 2.2)))),
        "aspecto": max(ancho / alto, alto / ancho),
        "area_relativa": (ancho * alto) / max(1, image.width * image.height),
    }


def detectar_por_perfil(image: Image.Image, perfil: dict, etiqueta: str):
    matriz = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR)
    alto, ancho = matriz.shape[:2]
    hsv = cv2.cvtColor(matriz, cv2.COLOR_BGR2HSV)
    centro = perfil["centro_hsv"]
    inferior = np.array([
        max(0, centro[0] - perfil["tolerancia_h"]),
        max(25, centro[1] - perfil["tolerancia_s"]),
        max(20, centro[2] - perfil["tolerancia_v"]),
    ], dtype=np.uint8)
    superior = np.array([
        min(179, centro[0] + perfil["tolerancia_h"]),
        min(255, centro[1] + perfil["tolerancia_s"]),
        min(255, centro[2] + perfil["tolerancia_v"]),
    ], dtype=np.uint8)
    mascara = cv2.inRange(hsv, inferior, superior)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mascara = cv2.morphologyEx(mascara, cv2.MORPH_OPEN, kernel)
    mascara = cv2.morphologyEx(mascara, cv2.MORPH_CLOSE, kernel, iterations=2)

    predicciones = []
    area_imagen = ancho * alto
    area_referencia = perfil["area_relativa"] * area_imagen
    aspecto_referencia = perfil["aspecto"]
    contornos, _ = cv2.findContours(mascara, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contorno in contornos:
        x, y, w, h = cv2.boundingRect(contorno)
        area_caja = w * h
        # El encuadre cambia entre frames, por eso toleramos escala, pero no
        # aceptamos manchas cuyo tamaño no guarda relación con el ejemplar.
        if not 0.08 * area_referencia <= area_caja <= 8.0 * area_referencia:
            continue
        aspecto = max(w / max(1, h), h / max(1, w))
        if not 0.30 * aspecto_referencia <= aspecto <= 3.2 * aspecto_referencia:
            continue
        relleno = cv2.contourArea(contorno) / max(1, area_caja)
        if relleno < 0.07:
            continue
        predicciones.append((etiqueta, min(0.95, 0.58 + relleno), (x, y, x + w, y + h)))
    return predicciones


def detectar_por_perfil_ar(image: Image.Image, perfil: dict, etiqueta: str):
    """Objetos delgados en frames AR: escala y orientación variables, sin abrir con 7x7."""
    hsv = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2HSV)
    centro = perfil["centro_hsv"]
    # La distancia circular también admite rojos alrededor de 0/179.
    tono = np.abs(hsv[:, :, 0].astype(np.float32) - centro[0])
    tono = np.minimum(tono, 180 - tono)
    mascara = (
        (tono <= perfil["tolerancia_h"])
        & (hsv[:, :, 1] >= max(25, centro[1] - perfil["tolerancia_s"]))
        & (np.abs(hsv[:, :, 2].astype(np.float32) - centro[2]) <= perfil["tolerancia_v"])
    ).astype(np.uint8) * 255
    # Cerrar pequeños huecos, sin eliminar trazos de uno o dos píxeles.
    mascara = cv2.morphologyEx(mascara, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    contornos, _ = cv2.findContours(mascara, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    predicciones = []
    for contorno in contornos:
        area = cv2.contourArea(contorno)
        if area < max(12, image.width * image.height * 0.000025):
            continue
        (_, _), (lado_a, lado_b), _ = cv2.minAreaRect(contorno)
        menor, mayor = sorted((lado_a, lado_b))
        if menor < 1 or mayor < 8:
            continue
        aspecto = mayor / menor
        aspecto_referencia = perfil.get("aspecto_ar", perfil["aspecto"])
        if not max(1, aspecto_referencia * 0.30) <= aspecto <= aspecto_referencia * 3.2:
            continue
        x, y, w, h = cv2.boundingRect(contorno)
        if w * h > image.width * image.height * 0.65:
            continue
        # El filtro AR había perdido el límite relativo usado por el modo 2D:
        # un trazo azul diminuto podía convertirse en otro esfero. Admitimos
        # hasta 25 veces menos área que la referencia para tolerar alejarse.
        area_referencia = perfil["area_relativa"] * image.width * image.height
        if w * h < max(24, 0.04 * area_referencia):
            continue
        relleno = area / max(1, lado_a * lado_b)
        if relleno < 0.25:
            continue
        # Es evidencia de apariencia, no una probabilidad de identificación.
        predicciones.append((etiqueta, min(0.90, 0.5 + relleno * 0.4), (x, y, x + w, y + h)))
    return predicciones
