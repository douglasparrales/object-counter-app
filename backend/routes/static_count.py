import io
import traceback

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from PIL import Image, ImageOps

from services.static_counter import StaticImageCounter


def crear_router(contador: StaticImageCounter) -> APIRouter:
    router = APIRouter(tags=["conteo-estatico"])

    @router.post("/count-image")
    async def count_image(
        file: UploadFile = File(...),
        objetivo: str = Form(default=""),
        seleccion_x: float | None = Form(default=None),
        seleccion_y: float | None = Form(default=None),
        seleccion_w: float | None = Form(default=None),
        seleccion_h: float | None = Form(default=None),
    ):
        try:
            # React Native respeta la orientación EXIF al mostrar la foto. El
            # backend debe aplicarla también para que la selección normalizada
            # apunte al mismo objeto que el usuario marcó en pantalla.
            image = ImageOps.exif_transpose(Image.open(io.BytesIO(await file.read()))).convert("RGB")
        except Exception as error:
            print(f"[count-image ERROR] Imagen inválida: {error}")
            raise HTTPException(status_code=400, detail="No se pudo leer la imagen enviada.") from error

        try:
            print(
                f"[count-image] Analizando {image.size[0]}x{image.size[1]} mediante mosaicos | "
                f"Objetivo: '{objetivo.strip()}'..."
            )
            # La inferencia es intensiva; sacarla del event loop permite que el
            # backend siga atendiendo salud, historial y otras solicitudes.
            valores_seleccion = (seleccion_x, seleccion_y, seleccion_w, seleccion_h)
            seleccion = None
            if all(valor is not None for valor in valores_seleccion):
                seleccion = tuple(float(valor) for valor in valores_seleccion)
                if (
                    seleccion[2] <= 0
                    or seleccion[3] <= 0
                    or seleccion[0] + seleccion[2] > 1
                    or seleccion[1] + seleccion[3] > 1
                    or any(valor < 0 or valor > 1 for valor in seleccion)
                ):
                    raise HTTPException(status_code=400, detail="La selección visual no es válida.")
            resultado = await run_in_threadpool(contador.contar, image, objetivo.strip(), seleccion)
            diagnostico = resultado["diagnostico"]
            print(
                f"[count-image RESULTADO] Total: {resultado['total']} | "
                f"General: {diagnostico['candidatos_generales']} | "
                f"Dirigidos: {diagnostico['candidatos_dirigidos']} | "
                f"Apariencia: {diagnostico['candidatos_apariencia']} | "
                f"Ruta: {diagnostico['ruta']} | "
                f"Mosaicos: {diagnostico['mosaicos']} | Tiempo: {diagnostico['duracion_segundos']}s"
            )
            return resultado
        except HTTPException:
            raise
        except Exception as error:
            print(f"[count-image ERROR] Inferencia: {error}")
            traceback.print_exc()
            raise HTTPException(status_code=500, detail="No se pudo contar la imagen.") from error

    return router
