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
    return {
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
