# Object Counter App

Aplicación móvil Android construida con Expo SDK 55 y React Native. Permite contar objetos desde una fotografía y realizar conteo en tiempo real con estabilización temporal. El backend usa FastAPI, YOLO y YOLO-World.

La rama `main` contiene la versión estable. El experimento de conteo espacial con ARCore nativo se desarrolla de forma aislada en `feature/arcore-native-counting` y todavía no forma parte del producto estable.

## Estado y alcance actual

- **Conteo desde foto:** se toma una fotografía, se escribe el nombre del objeto y se dibuja un rectángulo alrededor de un ejemplar. El resultado puede corregirse antes de guardarlo.
- **Conteo en tiempo real (estable):** se valida un ejemplar y se analizan imágenes periódicas. El total usa consenso temporal para evitar que cambios momentáneos o IDs inestables produzcan duplicados. Las cajas son una ayuda visual y no determinan el total.
- **ARCore nativo (en desarrollo):** la rama `feature/arcore-native-counting` reemplaza el prototipo Viro por una Activity Android nativa. El primer hito valida compatibilidad, detección de planos y anclas persistentes; detección automática y deduplicación 3D aún están pendientes.
- **Reportes:** se guardan localmente en SQLite sólo cuando el usuario confirma el guardado.

## Estructura del repositorio

```text
backend/             API FastAPI, detección y scripts de exportación
object-counter-app/  aplicación Expo/React Native
```

Los pesos de YOLO (`*.pt`), los entornos virtuales, `node_modules/` y las carpetas nativas generadas no se versionan. En una máquina limpia deben descargarse o generarse siguiendo esta guía.

## Requisitos

### Generales

- Git.
- Conexión a Internet durante la preparación inicial para descargar paquetes, Gradle y pesos de los modelos.
- Node.js **20.19.x** con npm. El proyecto usa Expo SDK **55**; evita Node 24 para este proyecto.
- Python **3.10 a 3.12**.
- Espacio disponible para dependencias, SDK de Android y modelos de IA.

### Android

- Android Studio con Android SDK Platform, Build-Tools, Platform-Tools (`adb`) y Command-line Tools.
- JDK 17. Puede usarse el JDK incluido con Android Studio.
- Variables de Android configuradas (`ANDROID_HOME` o `ANDROID_SDK_ROOT`) y `platform-tools` disponible en `PATH`.
- Un dispositivo Android físico con opciones de desarrollador y depuración USB habilitadas.
- Para **Contar AR**, un dispositivo compatible con ARCore y Google Play Services for AR instalado/actualizado.

La aplicación contiene módulos nativos (VisionCamera y, en la rama experimental, ARCore), por lo que debe construirse con `expo run:android`. No se debe usar Expo Go. Para cámara y AR se recomienda un dispositivo físico.

## Instalación en una máquina limpia

Los comandos principales están escritos para Windows PowerShell. Al final de cada sección se indican las diferencias para macOS/Linux.

### 1. Clonar y entrar al repositorio

```powershell
git clone URL_DEL_REPOSITORIO
cd object-counter-app
```

Todos los comandos siguientes parten de la raíz, donde se encuentran `backend/` y `object-counter-app/`.

### 2. Preparar el backend

En PowerShell:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cd ..
```

Si `py -3.12` no está disponible, usa `python -m venv .venv` con una versión compatible.

Si PowerShell impide activar scripts, no es necesario cambiar permanentemente la política del sistema. Se pueden ejecutar los comandos con el Python del entorno:

```powershell
.\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

En macOS/Linux:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cd ..
```

#### Pesos usados por el backend

El repositorio no incluye `yolov8s-worldv2.pt` ni `yolov8n.pt`. Ultralytics los descarga automáticamente la primera vez que se inicia el backend. Esa primera carga puede tardar y necesita Internet; después quedarán en `backend/` para reutilizarse.

Si se trabaja sin Internet, ambos archivos deben colocarse previamente dentro de `backend/` con esos nombres exactos.

### 3. Configurar la dirección del backend

El teléfono y el computador deben estar en la misma red local. No uses `localhost` ni `127.0.0.1`: desde el teléfono apuntan al propio teléfono.

En Windows, consulta la IPv4 del adaptador Wi-Fi o Ethernet activo:

```powershell
ipconfig
```

Dentro de `object-counter-app/`, crea un archivo `.env`:

```env
EXPO_PUBLIC_BACKEND_URL=http://192.168.1.3:8000
```

Sustituye `192.168.1.3` por la IPv4 real del computador y no añadas `/` al final.

La aplicación lee esta variable desde `object-counter-app/config/backend.ts`. Las variables `EXPO_PUBLIC_*` se incorporan al bundle: si cambia la IP, detén Metro y vuelve a iniciar o reconstruir la aplicación.

Existe una IP predeterminada de desarrollo en el código, pero no debe suponerse válida en otra máquina; configura siempre `.env`.

### 4. Instalar las dependencias de la app

Desde la raíz:

```powershell
cd object-counter-app
npm ci
```

Se usa `npm ci` porque el repositorio incluye `package-lock.json`. Usa `npm install` únicamente cuando se pretenda actualizar dependencias y el archivo lock.

### 5. Preparar el dispositivo Android

1. Abre Android Studio al menos una vez y completa la instalación del SDK solicitado.
2. Acepta las licencias del SDK desde Android Studio.
3. En el teléfono, activa **Opciones de desarrollador** y **Depuración USB**.
4. Conecta el teléfono por USB y acepta la autorización de depuración.
5. Comprueba la conexión:

```powershell
adb devices
```

El dispositivo debe aparecer con estado `device`, no `unauthorized` ni `offline`. Si hay varios dispositivos o emuladores, deja sólo el que usarás o selecciónalo cuando Expo lo solicite.

### 6. Iniciar el backend

Abre una terminal en la raíz del repositorio.

Con el entorno activado:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Sin activar el entorno:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
```

En macOS/Linux:

```bash
cd backend
source .venv/bin/activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Es importante iniciar Uvicorn desde `backend/`, porque `main.py` carga los modelos por nombre relativo. En el computador se puede comprobar FastAPI en:

```text
http://127.0.0.1:8000/docs
```

Desde otro dispositivo de la red debe ser accesible mediante:

```text
http://IP_DEL_COMPUTADOR:8000/docs
```

Si Windows muestra una solicitud del firewall, permite Python/Uvicorn en redes privadas. No expongas el puerto en redes públicas.

### 7. Compilar e instalar la app Android

Con el backend ejecutándose, abre otra terminal:

```powershell
cd object-counter-app
npx expo run:android
```

En una máquina limpia, Expo generará la carpeta nativa `android/`, ejecutará Gradle e instalará el development build. La primera compilación tarda más porque descarga dependencias nativas.

Acepta el permiso de cámara cuando la aplicación lo solicite. Si cambias configuraciones nativas, plugins, iconos o el modelo AR, vuelve a ejecutar `npx expo run:android`; una recarga de Metro no aplica esos cambios al binario instalado.

## Uso actual

### Conteo desde foto

1. Pulsa **Contar desde una foto**.
2. Encuadra todos los objetos y toma una fotografía.
3. Escribe el nombre del objeto que deseas contar.
4. Dibuja un rectángulo ajustado alrededor de un ejemplar.
5. Pulsa **Analizar**.
6. Revisa las detecciones. Puedes eliminar una caja incorrecta o añadir manualmente un objeto omitido.
7. Continúa y guarda el reporte sólo si deseas conservarlo.

### Conteo en tiempo real

1. Entra a **Conteo en tiempo real** y pulsa **Qué contar**.
2. Toma una foto de referencia, escribe el nombre y selecciona el ejemplar.
3. La app envía la referencia a `POST /identify` para validarla.
4. Pulsa **Contar** y mueve la cámara lentamente. El consenso temporal conserva el total estable ante pérdidas breves de detección.
5. Detén el conteo, revisa el total y guarda opcionalmente el reporte.

### ARCore nativo experimental

Disponible únicamente al cambiar a `feature/arcore-native-counting`. Por ahora permite abrir una sesión AR nativa, detectar superficies y colocar anclas manuales. No debe presentarse todavía como conteo automático terminado.

Desliza la pantalla de cámara hacia la izquierda o usa el menú lateral para consultar los reportes guardados.

## Red e Internet

- El teléfono debe poder alcanzar el puerto `8000` del computador.
- Algunas redes empresariales, universitarias o de invitados aíslan los dispositivos aunque estén en el mismo Wi-Fi.
- Si la IP cambia por DHCP, actualiza `EXPO_PUBLIC_BACKEND_URL` y reinicia/reconstruye la app.
- La traducción de nombres no incluidos en los alias locales usa `deep-translator` y puede necesitar Internet durante el uso. Los términos en inglés reducen esa dependencia.

## Solución de problemas

### La app no conecta con el backend

- Confirma que Uvicorn esté iniciado con `--host 0.0.0.0`.
- Comprueba que la IP de `.env` sea la del adaptador activo.
- Abre `http://IP_DEL_COMPUTADOR:8000/docs` desde el navegador del teléfono.
- Revisa el firewall y confirma que la red no aísle los dispositivos.
- Después de modificar `.env`, reinicia Metro o reconstruye la app.

### `adb devices` muestra `unauthorized`

Desconecta y conecta el cable, desbloquea el teléfono y acepta la huella RSA. También puede ser necesario revocar las autorizaciones de depuración USB y autorizar nuevamente.

### PowerShell no permite activar `.venv`

Usa directamente `.\backend\.venv\Scripts\python.exe`, como se muestra en los pasos anteriores, sin cambiar permanentemente la política del sistema.

### Fallan o faltan los modelos

Confirma que la primera ejecución del backend tenga Internet y permisos para escribir en `backend/`.

### El icono o los cambios nativos no aparecen

Desinstala el development build anterior y ejecuta nuevamente `npx expo run:android`. Los cambios nativos no se aplican sólo recargando JavaScript.

## Logs y limitaciones

- El backend registra peticiones, etiquetas enviadas a YOLO, resultados y duración.
- Metro muestra mensajes con prefijos como `[Camera]`, `[YOLO]`, `[Backend]`, `[Detección]`, `[Tracking]` y `[AR]`.
- Cuando un objeto cumple la estabilidad temporal aparece `[Tracking] Objeto estable confirmado #...`.
- YOLO-World utiliza el nombre como etiqueta; una foto de referencia no entrena una clase nueva.
- La comparación visual ayuda a filtrar candidatos, pero no garantiza reconocer cualquier objeto desconocido.
- El modo estable reduce duplicados mediante consenso temporal, pero no reconstruye el espacio físico. La garantía espacial fuera del encuadre es el objetivo de la rama ARCore nativa.

## Desarrollo por ramas

- `main`: aplicación estable (foto estática, conteo en tiempo real y reportes).
- `feature/arcore-native-counting`: experimento ARCore nativo derivado de `main`.

Publicación inicial de ambas ramas:

```powershell
git switch main
git push -u origin main
git switch feature/arcore-native-counting
git push -u origin feature/arcore-native-counting
```

Cuando AR cumpla sus criterios de aceptación, actualiza ambas ramas y fusiona mediante un pull request de `feature/arcore-native-counting` hacia `main`. Antes de fusionar, resuelve conflictos en la rama de la característica y vuelve a validar la app; no trabajes directamente sobre `main`.

## Datos locales

SQLite almacena las sesiones guardadas, resultados y eventos de auditoría. Las fotografías confirmadas se copian al directorio de documentos de la aplicación para que continúen disponibles en el historial. Estos datos permanecen en el dispositivo y pueden perderse al borrar sus datos o desinstalar la aplicación.
