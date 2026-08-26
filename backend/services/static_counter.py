import base64
import io
import time
from collections.abc import Callable

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


Prediccion = tuple[str, float, tuple[float, float, float, float]]
Inferencia = Callable[[Image.Image, float, int], list[Prediccion]]
InferenciaDirigida = Callable[[Image.Image, float, int, str], list[Prediccion]]


class StaticImageCounter:
    """Conteo de una foto de alta resolución sin compartir lógica con tiempo real."""

    TILE_SIZE = 960
    TILE_OVERLAP = 0.20

    def __init__(self, inferir_general: Inferencia, inferir_abierto: InferenciaDirigida):
        self.inferir_general = inferir_general
        self.inferir_abierto = inferir_abierto

    @staticmethod
    def _caja_seleccion(image: Image.Image, seleccion: tuple[float, float, float, float]):
        x, y, w, h = seleccion
        ancho, alto = image.size
        return (x * ancho, y * alto, (x + w) * ancho, (y + h) * alto)

    @classmethod
    def _toca_seleccion(cls, prediccion: Prediccion, caja_seleccion) -> bool:
        x1, y1, x2, y2 = prediccion[2]
        sx1, sy1, sx2, sy2 = caja_seleccion
        inter = max(0.0, min(x2, sx2) - max(x1, sx1)) * max(0.0, min(y2, sy2) - max(y1, sy1))
        area_prediccion = max(1.0, (x2 - x1) * (y2 - y1))
        area_seleccion = max(1.0, (sx2 - sx1) * (sy2 - sy1))
        union = area_prediccion + area_seleccion - inter
        iou = inter / union if union > 0 else 0.0
        cobertura_referencia = inter / area_seleccion
        proporcion_area = area_prediccion / area_seleccion
        # Un modelo sólo se considera válido si localiza el ejemplar con una
        # caja de escala comparable. Esto rechaza cajas gigantes de fondo cuyo
        # centro cae accidentalmente dentro de la selección.
        return iou >= 0.20 or (cobertura_referencia >= 0.55 and 0.25 <= proporcion_area <= 4.0)

    @staticmethod
    def _detectar_por_apariencia(
        image: Image.Image,
        seleccion: tuple[float, float, float, float],
        etiqueta: str,
    ) -> list[Prediccion]:
        """Respaldo visual para objetos repetidos con color semejante al ejemplar."""
        matriz = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR)
        alto, ancho = matriz.shape[:2]
        x, y, w, h = seleccion
        x1, y1 = max(0, round(x * ancho)), max(0, round(y * alto))
        x2, y2 = min(ancho, round((x + w) * ancho)), min(alto, round((y + h) * alto))
        if x2 - x1 < 12 or y2 - y1 < 12:
            return []

        hsv = cv2.cvtColor(matriz, cv2.COLOR_BGR2HSV)
        referencia = hsv[y1:y2, x1:x2]
        pixeles = referencia.reshape(-1, 3)
        # Los píxeles saturados describen mejor el objeto que el fondo incluido
        # accidentalmente al dibujar el rectángulo.
        saturados = pixeles[pixeles[:, 1] >= max(45, np.percentile(pixeles[:, 1], 55))]
        if len(saturados) < 30:
            saturados = pixeles
        centro = np.median(saturados, axis=0)
        tolerancia_h = max(8, min(22, round(float(np.std(saturados[:, 0]) * 1.8))))
        tolerancia_s = max(45, min(100, round(float(np.std(saturados[:, 1]) * 2.2))))
        tolerancia_v = max(55, min(115, round(float(np.std(saturados[:, 2]) * 2.2))))
        inferior = np.array([max(0, centro[0] - tolerancia_h), max(25, centro[1] - tolerancia_s), max(20, centro[2] - tolerancia_v)], dtype=np.uint8)
        superior = np.array([min(179, centro[0] + tolerancia_h), min(255, centro[1] + tolerancia_s), min(255, centro[2] + tolerancia_v)], dtype=np.uint8)
        mascara = cv2.inRange(hsv, inferior, superior)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        mascara = cv2.morphologyEx(mascara, cv2.MORPH_OPEN, kernel)
        mascara = cv2.morphologyEx(mascara, cv2.MORPH_CLOSE, kernel, iterations=2)

        area_referencia = max(1, (x2 - x1) * (y2 - y1))
        aspecto_referencia = max((x2 - x1) / max(1, y2 - y1), (y2 - y1) / max(1, x2 - x1))
        predicciones: list[Prediccion] = []
        contornos, _ = cv2.findContours(mascara, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contorno in contornos:
            bx, by, bw, bh = cv2.boundingRect(contorno)
            area_caja = bw * bh
            if not 0.12 * area_referencia <= area_caja <= 2.4 * area_referencia:
                continue
            aspecto = max(bw / max(1, bh), bh / max(1, bw))
            if not 0.35 * aspecto_referencia <= aspecto <= 2.8 * aspecto_referencia:
                continue
            relleno = cv2.contourArea(contorno) / max(1, area_caja)
            if relleno < 0.08:
                continue
            predicciones.append((etiqueta or "objeto similar", min(0.95, 0.55 + relleno), (bx, by, bx + bw, by + bh)))
        return predicciones

    @staticmethod
    def _iou(a: Prediccion, b: Prediccion) -> float:
        ax1, ay1, ax2, ay2 = a[2]
        bx1, by1, bx2, by2 = b[2]
        inter = max(0.0, min(ax2, bx2) - max(ax1, bx1)) * max(0.0, min(ay2, by2) - max(ay1, by1))
        union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
        return inter / union if union > 0 else 0.0

    @classmethod
    def _origenes_mosaico(cls, largo: int) -> list[int]:
        if largo <= cls.TILE_SIZE:
            return [0]
        paso = int(cls.TILE_SIZE * (1 - cls.TILE_OVERLAP))
        origenes = list(range(0, largo - cls.TILE_SIZE + 1, paso))
        ultimo = largo - cls.TILE_SIZE
        if origenes[-1] != ultimo:
            origenes.append(ultimo)
        return origenes

    @classmethod
    def _mosaicos(cls, image: Image.Image):
        ancho, alto = image.size
        for y in cls._origenes_mosaico(alto):
            for x in cls._origenes_mosaico(ancho):
                x2, y2 = min(x + cls.TILE_SIZE, ancho), min(y + cls.TILE_SIZE, alto)
                yield image.crop((x, y, x2, y2)), x, y

    @staticmethod
    def _globalizar(predicciones: list[Prediccion], offset_x: int, offset_y: int) -> list[Prediccion]:
        return [
            (clase, confianza, (x1 + offset_x, y1 + offset_y, x2 + offset_x, y2 + offset_y))
            for clase, confianza, (x1, y1, x2, y2) in predicciones
        ]

    @classmethod
    def _fusionar(cls, predicciones: list[Prediccion]) -> list[Prediccion]:
        """Elimina la misma caja vista en mosaicos solapados sin unir objetos vecinos."""
        elegidas: list[Prediccion] = []
        for candidata in sorted(predicciones, key=lambda item: item[1], reverse=True):
            duplicada = any(
                cls._iou(candidata, existente) >= (0.52 if candidata[0] == existente[0] else 0.78)
                for existente in elegidas
            )
            if not duplicada:
                elegidas.append(candidata)
        return elegidas

    @staticmethod
    def _anotar(
        image: Image.Image,
        predicciones: list[Prediccion],
        caja_referencia: tuple[float, float, float, float] | None = None,
    ) -> str:
        anotada = image.copy()
        dibujo = ImageDraw.Draw(anotada)
        fuente = ImageFont.load_default()
        grosor = max(3, round(max(image.size) / 700))
        if caja_referencia is not None:
            dibujo.rectangle(caja_referencia, outline="#FACC15", width=grosor)
            dibujo.text((caja_referencia[0] + 4, caja_referencia[1] + 4), "REFERENCIA", fill="#FACC15", font=fuente)
        for indice, (clase, confianza, caja) in enumerate(predicciones, 1):
            x1, y1, x2, y2 = caja
            color = "#4ADE80"
            dibujo.rectangle((x1, y1, x2, y2), outline=color, width=grosor)
            etiqueta = f"#{indice} {clase} {confianza:.0%}"
            izquierda, superior, derecha, inferior = dibujo.textbbox((x1, y1), etiqueta, font=fuente)
            dibujo.rectangle((izquierda, superior, derecha + 6, inferior + 6), fill="#10151c")
            dibujo.text((x1 + 3, y1 + 3), etiqueta, fill="white", font=fuente)
        buffer = io.BytesIO()
        anotada.save(buffer, format="JPEG", quality=88, optimize=True)
        return base64.b64encode(buffer.getvalue()).decode("ascii")

    @classmethod
    def _anotar_mosaicos(cls, image: Image.Image, mosaicos: list[tuple[int, int, int, int]]) -> str:
        anotada = image.copy()
        dibujo = ImageDraw.Draw(anotada)
        fuente = ImageFont.load_default()
        grosor = max(3, round(max(image.size) / 900))
        for indice, (x1, y1, x2, y2) in enumerate(mosaicos, 1):
            dibujo.rectangle((x1, y1, x2, y2), outline="#22D3EE", width=grosor)
            etiqueta = f"M{indice}"
            izquierda, superior, derecha, inferior = dibujo.textbbox((x1, y1), etiqueta, font=fuente)
            dibujo.rectangle((izquierda, superior, derecha + 8, inferior + 7), fill="#083344")
            dibujo.text((x1 + 4, y1 + 3), etiqueta, fill="white", font=fuente)
        buffer = io.BytesIO()
        anotada.save(buffer, format="JPEG", quality=86, optimize=True)
        return base64.b64encode(buffer.getvalue()).decode("ascii")

    def contar(
        self,
        image: Image.Image,
        objetivo: str = "",
        seleccion: tuple[float, float, float, float] | None = None,
    ) -> dict:
        inicio = time.time()
        generales: list[Prediccion] = []
        dirigidas: list[Prediccion] = []
        cantidad_mosaicos = 0
        limites_mosaicos: list[tuple[int, int, int, int]] = []
        caja_referencia = self._caja_seleccion(image, seleccion) if seleccion is not None else None
        apariencia = self._detectar_por_apariencia(image, seleccion, objetivo) if seleccion is not None else []
        apariencia_confirma_referencia = bool(
            caja_referencia
            and any(self._toca_seleccion(item, caja_referencia) for item in apariencia)
        )
        # Dos o más formas semejantes, incluyendo el ejemplar, constituyen una
        # señal fuerte para objetos repetidos. En ese caso evitamos 48
        # inferencias semánticas que sólo añadirían ruido y latencia.
        usar_solo_apariencia = apariencia_confirma_referencia and len(apariencia) >= 2

        for mosaico, offset_x, offset_y in self._mosaicos(image):
            cantidad_mosaicos += 1
            limites_mosaicos.append((offset_x, offset_y, offset_x + mosaico.width, offset_y + mosaico.height))
            if usar_solo_apariencia:
                continue
            # COCO aporta precisión en categorías conocidas; el modelo abierto
            # recupera objetos cotidianos pequeños que COCO no contiene.
            generales.extend(self._globalizar(self.inferir_general(mosaico, 0.25, self.TILE_SIZE), offset_x, offset_y))
            dirigidas.extend(self._globalizar(
                self.inferir_abierto(mosaico, 0.18, self.TILE_SIZE, objetivo), offset_x, offset_y
            ))

        todas = generales + dirigidas
        cantidad_apariencia = len(apariencia)
        if seleccion is not None:
            clases_generales = {item[0] for item in generales if self._toca_seleccion(item, caja_referencia)}
            generales = [item for item in generales if item[0] in clases_generales]
            # YOLO-World también debe detectar el ejemplar marcado antes de
            # aportar candidatos del resto de la escena.
            dirigido_confirma_referencia = any(
                self._toca_seleccion(item, caja_referencia) for item in dirigidas
            )
            if not dirigido_confirma_referencia:
                dirigidas = []
            todas = generales + dirigidas + apariencia

        objetos = self._fusionar(todas)
        ancho, alto = image.size
        resumen: dict[str, int] = {}
        respuesta_objetos = []
        for indice, (clase, confianza, (x1, y1, x2, y2)) in enumerate(objetos, 1):
            resumen[clase] = resumen.get(clase, 0) + 1
            respuesta_objetos.append({
                "id": indice,
                "clase": clase,
                "confianza": round(confianza, 3),
                "cx": round(((x1 + x2) / 2) / ancho, 4),
                "cy": round(((y1 + y2) / 2) / alto, 4),
                "w": round((x2 - x1) / ancho, 4),
                "h": round((y2 - y1) / alto, 4),
            })

        return {
            "total": len(objetos),
            "resumen": resumen,
            "objetos": respuesta_objetos,
            "imagen_anotada_base64": self._anotar(image, objetos, caja_referencia),
            "imagen_mosaicos_base64": self._anotar_mosaicos(image, limites_mosaicos),
            "diagnostico": {
                "mosaicos": cantidad_mosaicos,
                "candidatos_antes_de_fusion": len(todas),
                "objetivo": objetivo,
                "seleccion_visual": seleccion is not None,
                "candidatos_generales": len(generales),
                "candidatos_dirigidos": len(dirigidas),
                "candidatos_apariencia": cantidad_apariencia,
                "ruta": "apariencia" if usar_solo_apariencia else "modelos_y_apariencia",
                "duracion_segundos": round(time.time() - inicio, 3),
            },
        }
