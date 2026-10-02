# Object Counter App

Aplicación móvil Android construida con Expo SDK 55 y React Native. Permite contar objetos desde una fotografía y contar objetos durante un recorrido con memoria de posiciones. El backend usa FastAPI, YOLO y YOLO-World.

## Estado y alcance actual

- **Contar en una foto:** selección de referencia, detección y corrección manual antes de guardar.
- **Contar con la cámara:** registra superficies aproximadamente planas con detalles visuales y asigna posiciones e IDs persistentes a objetos inmóviles. Conserva el total fuera del encuadre y pausa incorporaciones cuando pierde la referencia visual.
- **Reportes:** guardado explícito en SQLite. La conexión al servidor se configura desde el menú y se conserva entre reinicios.

## Estructura del repositorio

```text
backend/             API FastAPI, detección y seguimiento
training/            lanzador del backend y herramientas de entrenamiento
object-counter-app/  aplicación Expo/React Native
```

Los checkpoints personalizados necesarios para inferencia se versionan bajo `backend/models/`, con sus hashes y perfiles. Los pesos generales originales se descargan al primer inicio. Las APK y archivos de `artifacts/`, las fotos privadas de `media-entrenamiento/`, las ejecuciones intermedias, los entornos virtuales, `node_modules/` y las carpetas nativas generadas no se versionan ni aparecen al clonar el repositorio.

## Requisitos

### Para ejecutar el backend y usar una APK instalada

- Git.
- Conexión a Internet durante la preparación inicial para descargar paquetes y pesos de los modelos.
- Python **3.10 a 3.12**.
- Espacio disponible para dependencias y modelos de IA.
- Teléfono Android con la APK instalada y acceso a la red local del computador.

### Adicionales para compilar la app Android

- Node.js **20.19.x** con npm. El proyecto usa Expo SDK **55**; evita Node 24 para este proyecto.
- Internet y espacio disponible para descargar Gradle y el SDK de Android.
- Android Studio con Android SDK Platform, Build-Tools, Platform-Tools (`adb`) y Command-line Tools.
- JDK 17. Puede usarse el JDK incluido con Android Studio.
- Variables de Android configuradas (`ANDROID_HOME` o `ANDROID_SDK_ROOT`) y `platform-tools` disponible en `PATH`.
- Un dispositivo Android físico con opciones de desarrollador y depuración USB habilitadas.
- Para investigar el módulo AR nativo, un dispositivo compatible con ARCore y Google Play Services for AR instalado/actualizado.

La aplicación contiene módulos nativos, por lo que debe construirse con `expo run:android`. No se debe usar Expo Go y se recomienda un dispositivo físico. La integración usa el módulo ARCore nativo existente, sin reintroducir Viro. No se necesita generar un modelo ONNX para contar.

## Instalación y puesta en marcha

Sigue estos pasos en orden. Los comandos principales son para Windows PowerShell y parten de la raíz del repositorio. Si ya tienes la APK instalada, omite el paso 3: para usar los modelos nuevos basta con iniciar el backend y conectar la app.

### 1. Clonar el repositorio

```powershell
git clone https://github.com/douglasparrales/object-counter-app.git
cd object-counter-app
```

Esta es la raíz: contiene `backend/`, `training/` y otra carpeta `object-counter-app/` con el código móvil. Si ya tienes el repositorio, abre PowerShell en esa raíz; no lo clones otra vez.

### 2. Instalar las dependencias del backend

Comprueba que tu Python sea una versión de **3.10 a 3.12**:

```powershell
python --version
```

La ruta principal de esta guía usa Python sin entorno virtual. Si prefieres aislar las dependencias, prepara primero el entorno de la alternativa siguiente; después continúa con el mismo comando de instalación.

<details>
<summary>Opcional: preparar un entorno virtual</summary>

Desde la raíz, en PowerShell:

```powershell
python -m venv backend/.venv
.\backend\.venv\Scripts\Activate.ps1
```

En macOS/Linux:

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate
```

Mantén ese entorno activado para los pasos 2 y 4. Si PowerShell bloquea la activación, sustituye `python` en ambos pasos por `.\backend\.venv\Scripts\python.exe`; no necesitas cambiar la política del sistema.

</details>

Instala las dependencias una sola vez, o cuando cambien sus archivos:

```powershell
python -m pip install -r backend/requirements.txt -c backend/constraints-inference.txt
```

`requirements.txt` indica las librerías necesarias y `constraints-inference.txt` fija las versiones verificadas. En macOS/Linux sin entorno virtual, usa `python3` en lugar de `python`.

### 3. Compilar e instalar la app, solo si necesitas un build de desarrollo

**Si ya tienes la APK instalada, pasa directamente al paso 4.** Este paso requiere Node.js, Android Studio, JDK 17 y las herramientas Android indicadas en los requisitos. Genera un build de desarrollo que usa Metro; no es una APK release independiente.

Abre Android Studio y completa la instalación del SDK y sus licencias. En el teléfono, activa **Opciones de desarrollador** y **Depuración USB**, conecta el cable y acepta la autorización. Comprueba la conexión:

```powershell
adb devices
```

El dispositivo debe aparecer como `device`. Si aparece `unauthorized`, desbloquea el teléfono y acepta la huella RSA. Si hay varios dispositivos, selecciona el deseado cuando Expo lo solicite.

Abre una segunda terminal en la raíz y ejecuta:

```powershell
cd object-counter-app
npm ci
npx expo run:android
```

`npm ci` instala las versiones de `package-lock.json`. Deja esta terminal abierta mientras utilizas el build de desarrollo; la primera terminal sigue en la raíz para iniciar el backend.

En una máquina limpia, Expo generará la carpeta nativa `android/`, ejecutará Gradle e instalará el development build. La primera compilación tarda más porque descarga dependencias nativas.

Acepta el permiso de cámara cuando la aplicación lo solicite.

<details>
<summary>Si actualizas un proyecto nativo que ya existía</summary>

Si cambias configuraciones nativas, plugins, iconos o el modelo AR, vuelve a ejecutar `npx expo run:android`; una recarga de Metro no aplica esos cambios al binario instalado.

Si `object-counter-app/android/` ya existía antes de cambiar de rama o antes de modificar `plugins/native-arcore`, regenera primero el proyecto nativo para que Expo copie y registre el módulo actualizado:

```powershell
npx expo prebuild --clean --platform android
npx expo run:android
```

La carpeta `android/` es generada y está ignorada por Git. El plugin configura `syncNativeArCoreSources` para copiar las fuentes Kotlin antes de cada compilación. Al incorporar el plugin por primera vez sigue siendo necesario `prebuild`; las siguientes compilaciones sincronizan AR aunque la carpeta Android ya exista.

</details>

### 4. Iniciar el backend

En la terminal situada en la raíz del repositorio, ejecuta:

```powershell
python training/serve_backend.py --host 0.0.0.0 --port 8000
```

El lanzador configura los modelos, entra internamente a `backend` y arranca Uvicorn. No tienes que entrar a esa carpeta ni ejecutar otro Uvicorn. Espera a que aparezca `Application startup complete` y deja la terminal abierta mientras usas la app. Puedes comprobar el servidor en `http://127.0.0.1:8000/docs` desde el computador.

Si Windows solicita permiso de firewall, permite Python/Uvicorn en redes privadas. No expongas el puerto en redes públicas.

<details>
<summary>Qué modelos carga este comando y qué significa el perfil aula</summary>

El repositorio no incluye `yolov8s-worldv2.pt` ni `yolov8n.pt`. Ultralytics los descarga automáticamente la primera vez que se inicia el backend. Esa primera carga puede tardar y necesita Internet; después quedarán en `backend/` para reutilizarse.

Si se trabaja sin Internet, ambos archivos deben colocarse previamente dentro de `backend/` con esos nombres exactos.

Los pesos personalizados incluidos en `backend/models/` ya contienen el aprendizaje; no es necesario descargar `media-entrenamiento/` ni entrenar de nuevo para usarlos.

`aula` es el perfil predeterminado del lanzador: escribir `--profile aula` u omitirlo produce exactamente la misma configuración, modelos y comportamiento de conteo. Habilita los detectores personalizados de monitor, mouse y teclado, y conserva el reconocimiento original para los demás objetos en el mismo servidor. No necesitas cambiar de perfil ni reiniciar el servidor según el objeto que quieras contar. Para mouse combina el modelo nuevo con el anterior y descarta cajas repetidas; monitor conserva el anterior y teclado usa el nuevo. `--profile aula-anterior` conserva el detector previo de monitor + mouse; `--profile monitores` conserva monitores v3; `--profile original` activa las rutas originales. `--check` verifica todos los checkpoints del perfil sin iniciar el servidor.

En la app escribe **monitor**, **mouse** o **teclado**, nunca aula.

Son perfiles experimentales, con resultados y límites publicados en [entrenamiento de teclados](docs/resultado-entrenamiento-teclado.md). El flujo de foto y el barrido usan los mismos detectores; acertar estas imágenes conocidas no garantiza reconocer todo en una clase nueva. El lanzador usa el Python activo y los pesos incluidos, sin depender del dataset privado ni de rutas del autor. Ejecutar `uvicorn main:app` directamente sin configurar variables conserva el comportamiento original: usa el lanzador para activar el entrenamiento.

Para entender cómo se elige entre YOLOv8n, World y los personalizados, consulta [flujo de detección y datasets](docs/flujo-deteccion.md).

</details>

### 5. Conectar la APK al servidor

Conecta el teléfono y el computador a la misma red local. Con una APK release instalada puedes desconectar el USB y usar Wi-Fi.

En otra terminal de Windows, consulta la dirección IPv4 del adaptador Wi-Fi o Ethernet activo:

```powershell
ipconfig
```

En macOS/Linux, consulta la IP local en la configuración de red del sistema.

Abre la app, entra en **Conexión al servidor** desde el menú y escribe esa IPv4, por ejemplo `192.168.1.3`. La app añade `http://` y el puerto `8000`; también acepta una URL completa con otro puerto. No uses `localhost`, `127.0.0.1` ni `0.0.0.0` como dirección en el teléfono: necesitas la IP del computador.

Pulsa **Probar conexión**. Si conecta, ya puedes contar. Si falla, comprueba desde el navegador del teléfono `http://IP_DEL_COMPUTADOR:8000/docs` y revisa la sección de solución de problemas.

La app guarda la dirección entre reinicios. Si cambia la IP del computador, actualízala aquí; no hace falta generar otra APK. La dirección guardada tiene prioridad sobre `EXPO_PUBLIC_BACKEND_URL`, que opcionalmente define una dirección inicial durante el build. Cada sesión de conteo conserva el servidor con el que empezó. La IP de desarrollo incluida en el código puede no corresponder a tu máquina.

### Para volver a usar la app otro día

Abre una terminal en la raíz y repite únicamente el paso 4 (activa antes el entorno si elegiste usarlo). Después abre la APK y comprueba la conexión del paso 5. No repitas la instalación de dependencias, el entrenamiento ni la compilación, salvo que los cambios del proyecto lo requieran. Si usas un build de desarrollo, inicia también Metro con `npm start` desde la carpeta móvil `object-counter-app/`.

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
6. Pulsa **Finalizar**, después **Guardar** si deseas conservar el reporte.

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

La referencia no entrena un modelo nuevo. Con el perfil predeterminado, monitor, mouse y teclado usan los detectores personalizados. En el detector general original, la categoría de pantallas no distingue exclusivamente monitores de televisores.

`main` contiene la integración actual. `respaldo/main-antes-conteo-20260924` conserva el estado anterior. El módulo ARCore permanece experimental y oculto.

## Datos locales

SQLite almacena las sesiones guardadas, resultados y eventos de auditoría. Las fotografías confirmadas se copian al directorio de documentos de la aplicación para que continúen disponibles en el historial. Estos datos permanecen en el dispositivo y pueden perderse al borrar sus datos o desinstalar la aplicación.

## Para pasar a producción

La app necesita validar precisión con equipos reales y distintas condiciones, mejorar el seguimiento entre profundidades, desplegar un backend seguro y estable, definir respaldo y privacidad de los datos y completar pruebas de rendimiento, recuperación de errores y distribución firmada.

## Modelos incluidos y datos privados de entrenamiento

Los cambios de entrenamiento de `feature/dataset-feedback` ya están integrados en `main`. Los modelos seleccionados están en `backend/models/` y sí se descargan al clonar; contienen lo aprendido para ejecutar el conteo sin disponer de las fotos originales. Se ejecutan en el backend, no dentro de la APK.

Los datasets tienen versiones locales bajo `media-entrenamiento/`, pero **esa carpeta completa está ignorada por Git**. Ni las imágenes, ni los videos, ni los experimentos, ni las copias locales de `media-entrenamiento/backups/` se distribuyen al clonar. Para continuar esos experimentos con los mismos datos se necesita obtener una copia privada por separado; para ejecutar la app no hace falta.

El repositorio sí incluye las herramientas de `training/`, el registro de modelos, los informes seleccionados y la documentación. Véanse [cómo se guarda y continúa el aprendizaje](docs/como-se-guarda-el-aprendizaje.md) y [los resultados de monitores, mouse y teclados](docs/resultado-entrenamiento-teclado.md). Las copias privadas requieren respaldo en otra unidad para protegerse de la pérdida del disco.

## Historial de ramas

Para clonar y ejecutar la versión integrada, utiliza `main`, que también incluye los modelos personalizados de monitor, mouse y teclado. La siguiente tabla conserva el estado histórico documentado el 24 de septiembre de 2026, anterior a esa integración de entrenamiento; no es un inventario actual de todas las ramas:

| Rama | Hasta dónde llega |
| --- | --- |
| `main` | Versión integrada a esa fecha: conteo por foto y por recorrido con memoria de IDs, reportes, configuración de conexión, interfaz unificada y limpieza del repositorio. Equipos informáticos pendientes de validación real. |
| `feature/arcore-native-counting` | En GitHub estaba en `02fa286`: avances experimentales de ARCore nativo, anteriores a las correcciones finales del recorrido y la interfaz. No es la versión más reciente para ejecutar la app. |
| `respaldo/main-antes-conteo-20260924` | Copia de main en `5150321`, anterior a la integración: conteo por foto y conteo de objetos visibles, reportes y configuración de IP; sin la nueva memoria del recorrido fuera del encuadre. |

La rama local `feature/arcore-native-counting` llegó hasta `291568a` y ese trabajo ya se integró en `main`; su copia remota no se actualizó. Para continuar con la versión actual, utiliza `main`.
