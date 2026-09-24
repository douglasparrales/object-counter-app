# Object Counter App

Aplicación móvil Android construida con Expo SDK 55 y React Native. Permite contar objetos desde una fotografía y contar objetos durante un recorrido con memoria de posiciones. El backend usa FastAPI, YOLO y YOLO-World.

La rama `main` integra el conteo por foto y por recorrido. El módulo ARCore nativo permanece experimental y oculto; no es el motor del conteo principal. La validación física disponible corresponde a esferos; falta evaluar la precisión con equipos informáticos reales.

## Estado y alcance actual

- **Contar en una foto:** selección de referencia, detección y corrección manual antes de guardar.
- **Contar con la cámara:** registra superficies aproximadamente planas con detalles visuales y asigna posiciones e IDs persistentes a objetos inmóviles. Conserva el total fuera del encuadre y pausa incorporaciones cuando pierde la referencia visual.
- **ARCore nativo:** permanece en el código como experimento, con acceso oculto. El conteo principal usa VisionCamera y el mapa de superficie del backend.
- **Reportes:** guardado explícito en SQLite. La conexión al servidor se configura desde el menú y se conserva entre reinicios.

## Estructura del repositorio

```text
backend/             API FastAPI, detección y seguimiento
object-counter-app/  aplicación Expo/React Native
```

Los pesos de YOLO (`*.pt`), los entornos virtuales, `node_modules/` y las carpetas nativas generadas no se versionan. En una máquina limpia deben descargarse o generarse siguiendo esta guía.

La carpeta local `analysis/` contiene material temporal de pruebas, no es necesaria para ejecutar la app y está excluida de Git.

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
- Para investigar el módulo AR nativo, un dispositivo compatible con ARCore y Google Play Services for AR instalado/actualizado.

La aplicación contiene módulos nativos, por lo que debe construirse con `expo run:android`. No se debe usar Expo Go y se recomienda un dispositivo físico. La integración usa el módulo ARCore nativo existente, sin reintroducir Viro. No se necesita generar un modelo ONNX para contar.

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

En la app abre el menú, entra a la configuración del backend y escribe esa IPv4, por ejemplo `192.168.1.3`. La app agrega automáticamente `http://` y el puerto `8000`, guarda la dirección en el teléfono y la reutiliza en los siguientes inicios. También puedes escribir una URL completa con otro puerto.

Después de iniciar el backend, usa **Probar conexión** en la app. No es necesario volver a generar la APK cuando cambia la IP.

Opcionalmente, `EXPO_PUBLIC_BACKEND_URL` permite definir una dirección inicial durante el build, pero la dirección guardada desde la app siempre tiene prioridad.

La dirección guardada en el teléfono tiene prioridad sobre la variable de entorno. Cada sesión de conteo conserva el servidor con el que empezó.

Existe una IP predeterminada de desarrollo en el código, pero no debe suponerse válida en otra máquina; revisa la dirección en **Conexión al servidor**.


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

Si `object-counter-app/android/` ya existía antes de cambiar de rama o antes de modificar `plugins/native-arcore`, regenera primero el proyecto nativo para que Expo copie y registre el módulo actualizado:

```powershell
npx expo prebuild --clean --platform android
npx expo run:android
```

La carpeta `android/` es generada y está ignorada por Git. El plugin configura `syncNativeArCoreSources` para copiar las fuentes Kotlin antes de cada compilación. Al incorporar el plugin por primera vez sigue siendo necesario `prebuild`; las siguientes compilaciones sincronizan AR aunque la carpeta Android ya exista.

## Uso actual

### Conteo desde foto

1. Pulsa **Contar desde una foto**.
2. Encuadra todos los objetos y toma una fotografía.
3. Escribe el nombre del objeto que deseas contar.
4. Dibuja un rectángulo ajustado alrededor de un ejemplar.
5. Pulsa **Analizar**.
6. Revisa las detecciones. Puedes eliminar una caja incorrecta o añadir manualmente un objeto omitido.
7. Continúa y guarda el reporte sólo si deseas conservarlo.

### Contar con la cámara

1. Entra a **Contar con la cámara** y captura una referencia.
2. Escribe el nombre, selecciona un ejemplar y confirma la referencia.
3. Pulsa **Contar**. Mantén objetos quietos sobre una superficie aproximadamente plana con detalles.
4. Avanza lentamente con vistas solapadas. Verde indica un objeto confirmado; amarillo, una detección pendiente.
5. Los objetos confirmados permanecen en el total fuera del encuadre. Si se pierde la referencia visual, vuelve a una zona conocida.
6. Pulsa **Finalizar**, después **Guardar** si deseas conservar el reporte. El botón Guardar tiene una pulsación sutil; Listo no tiene animación propia.

La captura siguiente empieza después de procesar la anterior y una espera de 400 ms. Esto no equivale a una frecuencia garantizada: depende del dispositivo, la red y la inferencia.

El mapa vive durante la sesión del backend. Reiniciar el servidor pierde ese mapa. Ningún objeto que nunca haya aparecido en una captura puede contarse. Para superficies lisas, objetos móviles o distintas profundidades no se garantiza precisión.


## Red e Internet

- El teléfono debe poder alcanzar el puerto `8000` del computador.
- Algunas redes empresariales, universitarias o de invitados aíslan los dispositivos aunque estén en el mismo Wi-Fi.
- Si la IP cambia por DHCP, actualízala desde la configuración de la app; no hace falta reconstruir la APK.
- La traducción de nombres no incluidos en los alias locales usa `deep-translator` y puede necesitar Internet durante el uso. Los términos en inglés reducen esa dependencia.

## Solución de problemas

### La app no conecta con el backend

- Confirma que Uvicorn esté iniciado con `--host 0.0.0.0`.
- Comprueba que la IP guardada en la configuración sea la del adaptador activo y usa **Probar conexión**.
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

## Funcionamiento y limitaciones

El backend registra detecciones, duración y estado del seguimiento (`[BARRIDO]`); Expo muestra el resultado recibido y errores de captura o conexión. El conteo por recorrido conserva IDs sobre un mapa de superficie aproximadamente plana con detalles visibles. Los objetos deben permanecer inmóviles; perder el registro pausa nuevas incorporaciones y conserva el total. Los recuadros pueden llevar retraso durante el movimiento.

La referencia no entrena un modelo nuevo. Los equipos informáticos usan categorías del detector; la clase de pantallas no distingue exclusivamente monitores de televisores. La validación física disponible es con esferos, no con equipos reales ni recorridos a distintas profundidades.

`main` contiene la integración actual. `respaldo/main-antes-conteo-20260924` conserva el estado anterior. El módulo ARCore permanece experimental y oculto.

## Datos locales

SQLite almacena las sesiones guardadas, resultados y eventos de auditoría. Las fotografías confirmadas se copian al directorio de documentos de la aplicación para que continúen disponibles en el historial. Estos datos permanecen en el dispositivo y pueden perderse al borrar sus datos o desinstalar la aplicación.

## Para pasar a producción

La app necesita validar precisión con equipos reales y distintas condiciones, mejorar el seguimiento entre profundidades, desplegar un backend seguro y estable, definir respaldo y privacidad de los datos y completar pruebas de rendimiento, recuperación de errores y distribución firmada.

## Alcance de las tres ramas

Estado verificado en GitHub el 24 de septiembre de 2026:

| Rama | Hasta dónde llega |
| --- | --- |
| `main` | Versión integrada actual: conteo por foto y por recorrido con memoria de IDs, reportes, configuración de conexión, interfaz unificada y limpieza del repositorio. Probada físicamente con esferos; equipos informáticos pendientes de validación real. |
| `feature/arcore-native-counting` | En GitHub permanece en `02fa286`: avances experimentales de ARCore nativo, anteriores a las correcciones finales del recorrido y la interfaz. No es la versión más reciente para ejecutar la app. |
| `respaldo/main-antes-conteo-20260924` | Copia de main en `5150321`, anterior a la integración: conteo por foto y conteo de objetos visibles, reportes y configuración de IP; sin la nueva memoria del recorrido fuera del encuadre. |

La rama local `feature/arcore-native-counting` llegó hasta `291568a` y ese trabajo ya se integró en `main`; su copia remota no se actualizó. Para continuar con la versión actual, utiliza `main`.
