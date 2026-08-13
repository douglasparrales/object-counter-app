# Object Counter App

Aplicación móvil de Expo/React Native para seleccionar y contar un objeto con cámara, YOLO-World y tracking de IDs persistentes. El código de AR con Viro/ARCore se conserva como experimento visual, pero no forma parte del flujo de conteo actual.

## Requisitos

- Node.js **20.19.x** y npm. El proyecto usa Expo SDK 54; evita Node 24 para Metro en este proyecto.
- Android Studio, Android SDK y un dispositivo Android físico con depuración USB habilitada. La cámara no funciona de forma fiable en Expo Go ni en el emulador.
- Python 3.10 a 3.12 para el backend.
- El teléfono y el computador deben estar en la misma red Wi-Fi cuando se usa el backend por IP local.

## Estructura

- `object-counter-app/`: aplicación móvil Expo.
- `backend/`: API FastAPI y pesos de YOLO-World.

## 1. Preparar el backend

Desde la raíz del repositorio:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Los pesos `yolov8s-worldv2.pt` ya están dentro de `backend/`. Si se eliminan, Ultralytics puede descargarlos la próxima vez que se inicie el backend.

La comparación visual de la foto de referencia requiere `opencv-python-headless` y `numpy`; están incluidos en `backend/requirements.txt`.

Inicia la API así:

```powershell
uvicorn main:app --host 0.0.0.0 --port 8000
```

El backend queda disponible en `http://IP_DEL_COMPUTADOR:8000`. Si Windows pregunta por el firewall, permite el acceso en redes privadas para Python/Uvicorn.

## 2. Configurar la IP del backend en el móvil

Obtén la IPv4 del computador con:

```powershell
ipconfig
```

En `object-counter-app/hooks/useDetection.ts`, cambia `BACKEND_URL` por la IPv4 de tu computador, por ejemplo:

```ts
const BACKEND_URL = 'http://192.168.1.3:8000';
```

## 3. Instalar y ejecutar la app Android

En otra terminal:

```powershell
cd object-counter-app
npm install
npx expo run:android
```
La app solicita permiso de cámara. Acéptalo en el teléfono.

## Uso

1. Pulsa **Qué contar** y toma una foto de referencia.
2. Escribe el nombre del objeto y confirma.
3. La app envía la foto a `POST /identify` para validar la etiqueta.
4. Pulsa **Contar** y elige un modo:
   - **Tiempo real**: para objetos separados y visibles en cámara. Cada objeto recibe una caja verde y un ID.
   - **Foto masiva**: para muchos objetos pequeños o juntos (tornillos, caramelos, bolichas). Toma una foto de alta calidad y la analiza a mayor resolución.
5. Al detener, revisa el total, escribe opcionalmente el lugar (por ejemplo, `Lab 1`) y pulsa **Guardar** sólo si deseas conservar el reporte.
6. Desliza la pantalla de cámara hacia la izquierda para ver los reportes guardados.

## Logs para diagnosticar

- En la terminal del backend aparecen las peticiones, la traducción/etiquetas enviadas a YOLO, el número de objetos y la duración.
- En la consola de Metro aparecen mensajes con los prefijos `[Camera]`, `[YOLO]`, `[Backend]`, `[Detección]` y `[Tracking]`.
- Cuando un objeto pasa dos frames consecutivos con una posición compatible, aparece el mensaje `[Tracking] Objeto confirmado #...` y el contador aumenta.

## Cómo funciona YOLO-World y limitación actual

YOLO-World es un detector por texto: utiliza el nombre del objeto como etiqueta y no aprende visualmente una clase nueva a partir de una única foto de referencia. La foto actual valida que el objeto y el texto coinciden; no es un entrenamiento ni una comparación imagen-a-imagen.

Por ejemplo, `esfero` se normaliza a `ballpoint pen` y `pen`, porque traducirlo literalmente como `sphere` produce una etiqueta equivocada. Para objetos muy específicos, escribe una etiqueta común y concreta en español o inglés. Ningún detector general garantiza reconocer literalmente cualquier objeto desconocido sólo con una imagen de referencia.

## Tracking y límites conocidos

El conteo actual usa VisionCamera para capturar frames, YOLO-World para localizar candidatos por nombre y una comparación visual entre cada caja y la foto de referencia. El backend descarta cajas con una apariencia distinta y elimina cajas solapadas antes de enviarlas al móvil. En tiempo real sólo se muestran cajas vistas en el frame reciente, para que una posición anterior no se sume a la actual cuando la cámara se mueve.

## Icono y desarrollo Android

El icono ya está configurado en `app.json`. Si el teléfono sigue mostrando el icono por defecto de React Native, corresponde al binario Android ya instalado: desinstala esa app del dispositivo y vuelve a generar/instalar el desarrollo con `npx expo run:android`. Los cambios de icono no se aplican sólo recargando Metro.

Para contar con precisión, mantén todos los objetos a contar visibles y la cámara relativamente estable hasta que el total se estabilice. Si se necesita recorrer un espacio moviendo la cámara y conservar identidad tras perder de vista objetos, hace falta una integración AR real o comparación visual por embeddings; no se puede prometer esa garantía sólo con cajas 2D.

## Reportes y auditoría local

Los reportes se guardan sólo al confirmarlo el usuario. SQLite guarda la sesión (objeto, clase YOLO, ubicación, total y fechas), el resultado asociado y un evento `REPORTE_GUARDADO` en la tabla de auditoría. La foto de referencia se copia al directorio de documentos de la app antes de guardar para que siga disponible en el historial.
