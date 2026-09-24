# Diagnóstico del conteo

Los logs describen lo que hizo el programa; no demuestran por sí solos cuántos objetos físicos hay. Para investigar un conteo incorrecto, compara el número real, un video corto de la pantalla y los registros del mismo intervalo.

## Guardar los registros en PowerShell

Backend, desde `backend/` (no inicies otro si ya está usando el puerto 8000):

```powershell
New-Item -ItemType Directory -Force ../analysis | Out-Null
python -u -m uvicorn main:app --host 0.0.0.0 --port 8000 2>&1 | Tee-Object ../analysis/backend.log
```

Expo, desde `object-counter-app/`:

```powershell
New-Item -ItemType Directory -Force ../analysis | Out-Null
npx expo start --dev-client 2>&1 | Tee-Object ../analysis/expo.log
```

Esto inicia Metro para una app de desarrollo ya instalada. Si cambian dependencias o código nativo, usa `npx expo run:android`; los cambios normales de JavaScript no necesitan recompilar Android. Puedes usar el menú de desarrollo del teléfono para recargar si la captura con Tee-Object interfiere con las teclas de Metro.

Para fallos nativos con el teléfono conectado por USB, desde la raíz:

```powershell
New-Item -ItemType Directory -Force analysis | Out-Null
adb logcat -d -v threadtime ReactNativeJS:V AndroidRuntime:E '*:S' > analysis/android.log
```

`-d` recoge lo que todavía conserva el búfer; úsalo inmediatamente después del fallo. Revisa el contenido antes de compartirlo: puede contener datos o rutas locales. No publiques logs ni imágenes privadas en GitHub.

## Qué significa cada registro

| Registro | Qué revisar |
| --- | --- |
| `/identify`, `[REFERENCIA]` | Clase elegida, selección del ejemplar y referencia disponible. |
| `/detect RESULTADO` | Objetos visibles, ruta del detector y tiempo. `apariencia` busca el perfil visual; `coco_dispositivo` detecta categorías de equipos; `yolo` usa vocabulario abierto. |
| `[BARRIDO]` (backend) | `secuencia`: imagen procesada; `total`: inventario acumulado; `estado`: seguimiento; `coincidencias`: características visuales del fondo, no objetos; `error_px`: error de registro, no porcentaje de precisión; `vistas`: vistas del mapa. |
| `[Barrido]` (Expo) | Total, estado y cantidad visible recibidos por el móvil. |
| `[Detección] Error en frame` | Error de captura, petición o sesión. Compararlo con el backend en el mismo momento. |
| `[Reporte]` | Resultado del guardado; si falla, conservar el mensaje completo. |
| HTTP 409 | Sesión/referencia no disponible o secuencia inválida; revisar el detalle de respuesta. Reiniciar el backend borra las sesiones en memoria. |
| HTTP 503 / traceback | Fallo de inferencia o capacidad; conservar la excepción completa. |

`INICIANDO` prepara el mapa; `SIGUIENDO` indica registro válido. `SIN_COINCIDENCIA` conserva el total y pausa incorporaciones hasta recuperar el mapa. No significa necesariamente que el detector no vea objetos. Un total mayor que los visibles es normal si algunos ya salieron del encuadre.

## Cómo reportar un fallo concreto

Envía: cantidad real y tipo de objetos, pasos y hora aproximada, total esperado y observado, si moviste objetos o solo el teléfono, orientación, video corto y logs de backend/Expo del mismo intervalo. Para un cierre inesperado añade `android.log`. No recortes solamente la última línea de un traceback.

Ejemplo: «Cuatro esferos inmóviles. Al girar el teléfono a horizontal, el total pasa de 4 a 5 en la secuencia 32. Adjunto el video y registros antes/después». Eso permite separar una falsa detección del fondo de una identidad duplicada.

## Instrumentación usada durante el desarrollo

Se añadieron registros de seguimiento y diagnósticos para comparar detección, mapa e interfaz. `[AR_DETECT]` corresponde al modo AR experimental; no es el registro principal del recorrido actual. Además, durante las pruebas se usó un lanzador local que guardaba fotogramas y transformaciones para reproducir los fallos. Ese material quedó en `analysis/`, excluido de Git, y no forma parte del arranque normal con Uvicorn. El arranque normal no guarda esos fotogramas automáticamente.

La revisión combinó logs, capturas del Samsung por ADB, reproducción de imágenes y pruebas automatizadas. Ninguna de esas fuentes por separado garantiza precisión en todos los escenarios; la memoria actual supone objetos inmóviles y una superficie aproximadamente plana con detalles visibles.
