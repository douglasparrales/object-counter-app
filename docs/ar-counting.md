# Conteo espacial — decisión e implementación (2026-09-15)

## Actualización 2026-09-22 — barrido de superficie

El flujo principal de cámara ahora ofrece **Contar** (barrido de superficie) mediante VisionCamera y
`/scan/sessions` + `/detect?modo=barrido`. No depende de que ARCore encuentre un
plano. El backend registra el fondo mediante SIFT/homografía RANSAC y guarda
posiciones e IDs de objetos en un mapa común durante la sesión. Confirma en dos
capturas, conserva objetos fuera del encuadre y congela altas al perder el mapa.
El camino nativo se conserva en el código para investigación, pero su botón está oculto. El modo principal se presenta como **Contar**.

La referencia diagonal usa la proporción del componente orientado, evitando
rechazar esferos delgados por la proporción de su rectángulo exterior. La interfaz
muestra IDs, cajas verdes confirmadas, amarillas pendientes y estado de recuperación;
el contador es compacto y no tapa el centro de la cámara. No permite cambiar de
cámara mientras cuenta. Finalizar espera la última petición antes de guardar el total.

Validación física: tres esferos detectados y confirmados en Samsung SM_A266M,
total conservado en 3 después de salir de cámara y regresar, confirmado por el
usuario y registros del backend. El escenario de descubrir tres objetos a lo
largo de un recorrido se verifica con imágenes sintéticas; no se confunde con esa
prueba física que comenzó mostrando los tres.

Requiere objetos inmóviles, superficie aproximadamente plana con textura y
capturas solapadas. Las sesiones están en memoria (expiran tras 30 minutos de
inactividad): reiniciar el backend o finalizar requiere comenzar un nuevo mapa.
No garantiza conteo exacto para cualquier objeto, movimiento o superficie.

Estos cambios del barrido son Python/TypeScript: con la instalación actual basta
recargar JS y reiniciar el backend si cambia Python. Cambios del módulo Kotlin
sí requieren reconstruir e instalar Android.

[Revisión del vídeo segundo a segundo y evidencia](../analysis/ar-video-20260922/review.md).

## Revisión 2026.09.22.2 — bloqueo antes de confirmar el primer objeto

La ejecución aportada después de 2026.09.22.1 sólo envió una imagen a `/detect`.
El backend respondió en 151 ms con tres cajas de apariencia. Durante casi un
minuto la cámara reportó mayormente `TRACKING`, pero hubo una respuesta pendiente,
cero frames estables y ningún evento `proyeccion`. La pantalla mostraba
`NotTrackingException` y «Recuperando posiciones ya contadas» con total cero.

El guard global `mapa.estado` de la revisión anterior fue una regresión:
incluía regiones creadas para capturas y superficies provisionales. Una región
pausada ejecutaba `return` antes de procesar respuestas, pedir nuevas imágenes
o caducar las anteriores. El HUD también actualizaba el estado de cámara después
de ese guard, mostrando una pausa antigua como si fuera actual.

Correcciones:

- Separar las anclas temporales de captura de las regiones de objetos. Las
  superficies de cada imagen se guardan relativas a su cámara, sin crear
  regiones persistentes. Liberar la captura sólo libera su ancla temporal.
- Reservar la pausa de altas para referencias de objetos **confirmados**. Una
  captura pausada puede reintentarse o caducar; no bloquea imágenes posteriores.
- Gestionar liberación y caducidad antes de los retornos por seguimiento. Incluso
  resultados de generaciones antiguas vuelven al hilo GL para soltar recursos;
  al cerrar, el mapa libera también las anclas temporales todavía en inferencia.
- Tratar `NotTrackingException` como transición recuperable en captura y al crear
  un objeto. Reintentar captura tras 150 ms, sin el backoff de 2 s de otros fallos.
- Actualizar el estado de cámara antes del guard y registrar
  `confirmados_sin_tracking`, `captura_reintentada` y `captura_descartada`.
- Rechazar en AR cajas cortadas por el borde antes de anclarlas. Un centro de caja
  parcial se desplaza al entrar el objeto completo y puede producir otra identidad.
  Reducir fragmentos del filtro de apariencia con un mínimo de área relativo a la
  referencia (4 %, más permisivo que el 8 % del filtro 2D original).

Reiniciar el backend para cargar el filtro y recompilar/reinstalar Android:
debe aparecer **AR 2026.09.22.2**. No se ejecutaron tests, compilación ni la app,
por instrucción del usuario. La revisión fue de código y logs; la recuperación
real del seguimiento y el conteo físico todavía requieren la prueba del teléfono.
El backend debería recibir múltiples peticiones y Metro mostrar `proyeccion`;
una única respuesta retenida indefinidamente sería un fallo, no un conteo válido.

### Video e IA multimodal

[Gemini documenta el análisis de video](https://ai.google.dev/gemini-api/docs/video-understanding)
mediante información visual temporal, con muestreo configurable de fotogramas.
Integrar una API que recibe video y devuelve un conteo estimado es más simple que
mantener un mapa AR. Sin embargo, una respuesta numérica no constituye una prueba
de identidad física: puede omitir objetos pequeños o confundir revisitas. Para
un conteo verificable conviene devolver evidencia por objeto (cajas e identidades)
y registrar posiciones en una escena común. Para objetos planos quietos, una
alternativa de ingeniería es alinear vistas solapadas en un mosaico y contar allí;
requiere controlar perspectiva, paralaje y pérdida de correspondencias. Esta
revisión corrige AR, no implementa una API externa ni una carga de MP4.

Las secciones siguientes son historial de implementación.

## Revisión 2026.09.22.1 — logs con detecciones y cero ubicaciones

Los logs aportados muestran dos detecciones, pero `SIN_PLANOS` y
`ANCLA_CAPTURA_SIN_TRACKING` impiden convertirlas en objetos persistentes.
También hay una identificación fallida por red que antes podía confirmarse
como si existiera una referencia válida. Estos datos no prueban la precisión
del detector ni explican por sí solos las pausas nativas de ARCore.

Cambios implementados en `feature/arcore-native-counting`:

- Capturar profundidad junto con la imagen CPU y la cámara de captura. Copiar
  milímetros respetando los strides y little-endian; cerrar la imagen nativa
  inmediatamente. Rechazar profundidad antigua y muestras con discontinuidades.
  La transformación entre sensor y textura se guarda antes de enviar el HTTP.
- Resolver con planos cuando existen; si no hay intersección válida, usar la
  profundidad guardada. Ya no hace falta mantener la cámara inmóvil hasta que
  llegue la respuesta para usar Depth. No se usa una distancia inventada.
- Conservar las superficies anteriores si una actualización no tiene planos.
  Preferir una referencia asociada a un plano cuando se crea la primera región.
- Exigir dos frames con seguimiento para capturar, dos observaciones para
  confirmar con plano y tres con profundidad. La asociación permite hasta 4 cm
  de diferencia a lo largo del eje de profundidad, conservando el radio lateral
  pequeño. Una caja ambigua espera otra vista; los lotes antiguos no confirman
  candidatos nuevos ni crean otro candidato encima.
- Pausar altas si cualquier región del mapa está pausada o perdida, incluyendo
  las regiones de capturas/candidatos. Antes sólo se comprobaban confirmados y
  podían crearse referencias independientes durante una interrupción inicial.
- Añadir miniatura de la última imagen analizada con sus cajas, sin colocar cajas
  antiguas sobre una cámara que ya se movió. Mostrar IDs verdes persistentes
  `#1`, `#2`, etc. y disponibilidad de profundidad. Los IDs desaparecen de la
  vista al salir del encuadre, pero siguen en el total de la misma sesión.
- Bloquear la confirmación de una referencia fallida; permitir reintentar la
  identificación conservando la foto y la selección.

### Fuentes y alternativas revisadas

- [Depth para Android](https://developers.google.com/ar/develop/java/depth/developer-guide)
  y [Frame](https://developers.google.com/ar/reference/java/com/google/ar/core/Frame):
  profundidad en milímetros sobre el eje óptico, disponibilidad, timestamps y
  liberación de imágenes. Un mapa de profundidad suavizado no garantiza exactitud
  milimétrica; la dispersión local filtra ruido, no mide toda la incertidumbre.
- [Hello AR oficial de Google](https://github.com/google-ar/arcore-android-sdk/tree/master/samples/hello_ar_kotlin)
  y [ARCore con machine learning](https://developers.google.com/ar/develop/java/machine-learning):
  cámara CPU, seguimiento, profundidad y renderización de anclas.
- [Tracking de Ultralytics](https://docs.ultralytics.com/modes/track): BoT-SORT
  compensa movimiento de cámara y admite reidentificación. Es útil para video,
  pero un ID temporal por sí solo no demuestra que dos objetos idénticos vistos
  en momentos separados sean distintos. Contar IDs sin reconstrucción espacial
  puede duplicar al volver a una zona. No se añadió un modo MP4 en esta revisión.

### Estado de validación y uso

Por petición del usuario no se ejecutaron tests, compilaciones ni la app.
Se revisaron fuentes y diferencias de código. La precisión física y la causa
de las pausas `PAUSED/NONE` siguen pendientes de validación en el teléfono.
No se modificó `main`; tampoco la configuración local de backend ya editada.

Hay que recompilar e instalar Android, no sólo recargar Metro. Desde
`object-counter-app`, el usuario puede ejecutar `npx expo run:android`.
La pantalla y el bridge deben indicar **AR 2026.09.22.1**. El Gradle existente
copia todos los Kotlin del plugin, incluido `ArDepthSnapshot.kt`.

Para evaluar: identificar el ejemplar, recorrer objetos quietos con vistas
solapadas y regresar al inicial. La miniatura permite comprobar si el detector
encierra cada objeto completo; el número verde identifica qué ya se confirmó.
El total esperado debe conservarse al apartar y regresar la cámara. Comparar
`profundidad_capturada`, `ubicados`, `candidato_creado` y `objeto_reconocido` en
Metro. Si el mapa no recupera seguimiento, no se acumulan altas a ciegas.
Persistencia aquí significa durante esa sesión, no tras cerrar/reabrir la app.

El historial que sigue describe versiones anteriores y sus limitaciones.

## Objetivo y alcance

Recorrer cuatro esferos quietos con el teléfono, confirmar cuatro identidades espaciales y conservar el total al volver al primero. La detección indica qué aparece en una imagen; el mapa determina si su posición ya pertenece a un objeto registrado. La primera entrega cubre superficies horizontales y objetos apoyados en ellas. Un recorrido rápido, objetos amontonados o movidos durante el conteo y la pérdida definitiva del mapa no permiten garantizar identidad física.

## Investigación y decisión

- [ARCore + aprendizaje automático, guía y ejemplo oficial](https://developers.google.com/ar/develop/java/machine-learning): usa la imagen CPU de ARCore para detección y convierte coordenadas de imagen a escena. La imagen CPU puede tener menos resolución que el preview.
- [Anclas de ARCore](https://developers.google.com/ar/develop/anchors): recomienda compartir anclas entre objetos cercanos; anclas independientes pueden moverse entre sí durante las correcciones del mapa.
- [Tracking de Ultralytics](https://docs.ultralytics.com/modes/track/): mantiene tracks durante un número limitado de frames perdidos. Sus mecanismos de compensación de cámara y reidentificación ayudan, pero no proporcionan por sí solos un inventario permanente de objetos idénticos fuera del encuadre.
- [Grabación y reproducción ARCore](https://developers.google.com/ar/develop/recording-and-playback): permite registrar la sesión para reproducirla con información AR. Es una alternativa posterior para procesar recorridos; un MP4 común requiere resolver el movimiento de cámara y la escala por otra vía.

Se mantiene ARCore + detector + registro espacial. No se agregó un segundo modo de video sin resolver su identidad espacial. Para exigir identidad inequívoca incluso al mover objetos, la alternativa es identificarlos físicamente (por ejemplo, etiquetas únicas) y cambiar el flujo de captura. Ninguna de estas opciones implica prometer reconocimiento visual infalible.

## Problemas encontrados en el código

1. Candidatos e inferencias se borraban ante cualquier pausa, aunque durara pocos frames. Se exigían dos resultados remotos para confirmar y podía perderse siempre la primera evidencia.
2. La captura esperaba al servidor: mientras llegaba una respuesta no se recogían otras vistas del recorrido.
3. El perfil de color limpiaba con un kernel 7×7; podía eliminar trazos delgados en la imagen CPU de AR. Su relación de aspecto dependía de la orientación de la caja.
4. El radio fijo de 3,5 cm podía fusionar objetos pequeños vecinos y la asociación permitía adjudicar más de una caja a la misma identidad.
5. Los estados cambiaban varias veces por segundo y ocultaban la diferencia entre detector sin resultados y objeto sin posición 3D.
6. Finalizar podía guardar antes de recibir los resultados pendientes. Además, actualizar JavaScript no garantiza actualizar Kotlin cuando el proyecto Android ya existe.

## Flujo implementado

1. Conservar la configuración de cámara recomendada por ARCore para el dispositivo, sin forzar la resolución CPU máxima. Registrar cámara, resolución, FPS y profundidad efectiva.
2. Capturar como máximo cada 350 ms, copiar los datos y cerrar inmediatamente la imagen nativa. Mantener hasta seis capturas pendientes; no generar una cola ilimitada.
3. Guardar intrínsecos, cámara y planos relativos a las referencias compartidas del mapa. JPEG y HTTP se procesan fuera del hilo de render.
4. Enviar `modo=ar_espacial` al backend. Este modo conserva trazos delgados y mide el aspecto con rectángulo orientado. Un error de inferencia devuelve 503, no una lista vacía que parezca éxito. Los otros modos mantienen su filtro visual anterior.
5. Reproyectar cada respuesta desde su cámara de captura. Incorporar planos descubiertos o ampliados durante la inferencia. El hit-test del frame actual es sólo un fallback para una cámara prácticamente inmóvil.
6. Asociar cada observación a la identidad espacial más cercana, una vez por identidad en cada lote. El radio se adapta a la huella observada, entre 8 y 25 mm. Dos capturas distintas confirman un objeto.
7. Conservar confirmados fuera del encuadre y candidatos durante interrupciones breves. Pausar las altas mientras las referencias confirmadas no sigan el mapa; nunca crear un mapa nuevo silenciosamente para seguir sumando.
8. Mostrar mensajes durante al menos 2,5 segundos. El diagnóstico separado indica resultados del detector, posiciones resueltas, candidatos, latencia y cola. El total se actualiza sin esperar al cambio de mensaje.
9. Finalizar detiene capturas nuevas y espera las pendientes. Si quedan candidatos, capturas omitidas o fallos, ofrece seguir recorriendo o guardar sólo los confirmados.

La cola limitada evita perder todas las vistas intermedias por la latencia, pero no transforma un servidor lento en un detector a velocidad de video. La advertencia de análisis atrasado exige reducir la velocidad o repasar esa zona. Los candidatos requieren al menos dos imágenes útiles: conviene que cada objeto permanezca visible aproximadamente un segundo durante el recorrido.

## Identificar una instalación actualizada

La vista muestra `AR 2026.09.15.2`. El bridge comunica la misma versión y JavaScript rechaza versiones anteriores con un mensaje específico. El task Gradle `syncNativeArCoreSources` copia las fuentes de `plugins/native-arcore` antes de compilar, incluso si no se volvió a ejecutar prebuild. No modifica `main`, no instala la app y no elimina datos del usuario.

## Verificación pendiente en el teléfono

Este documento no afirma que se haya ejecutado la app. Después de compilar e instalar la versión actualizada, el caso de aceptación es:

- Referencia de un esfero, cuatro esferos quietos sobre una mesa, recorrido lento con solapamiento: el total debe llegar a cuatro.
- Volver al primero y repetir el recorrido: el total debe continuar en cuatro.
- Una pausa breve debe conservar el total y los candidatos. Un fallo de mapa debe detener altas y explicar cómo continuar.
- Finalizar durante una petición debe esperar o advertir sobre resultados pendientes, no guardar silenciosamente un total incompleto.
- En caso de cero, leer el diagnóstico: cero visibles apunta al detector; visibles sin ubicados apunta a geometría; ubicados sin confirmados apunta a observaciones insuficientes o asociación.

Los eventos `NativeArCore` también llegan a Metro como `[AR diagnóstico]`. Compilar y revisar tipos verifica integración, no la precisión óptica ni el comportamiento de un dispositivo físico.

## Revisión del video del 15 de septiembre

El video de 27 segundos muestra la versión 2026.09.15, cero confirmados y respuestas de uno o dos visibles con cero ubicados. El seguimiento alterna entre estable y pausa; no aparece contorno azul. El backend responde 200 y usa la ruta de apariencia. Esto demuestra un bloqueo de ubicación espacial, pero no identifica por sí solo la causa física de la inestabilidad. Dos visibles no demuestra que sean dos esferos distintos: pueden ser fragmentos o falsas detecciones; se registran las cajas para investigarlo.

Cambios de la revisión 2026.09.15.2:

- Conservar la cámara predeterminada de ARCore y registrar la textura GL sólo al crearla o reanudar la sesión. Referencia: [configuración oficial de cámara](https://developers.google.com/ar/develop/java/camera-configs).
- Retener resultados sin ubicación hasta ocho segundos, con un máximo de ocho resultados diferidos, para aprovechar planos detectados después de la respuesta. Reintentar no convierte una captura en dos observaciones; se conserva el ID del lote y sólo se reintentan detecciones sin posición.
- Mostrar el número de planos y el motivo nativo de la pausa. Renovar la orientación cada 2,5 segundos incluso si los estados alternan; el requisito anterior de 500 ms estables podía congelar el texto inicial.
- Advertir antes de guardar cero o un recorrido con detecciones sin ubicar. No sustituir un mapa ausente por un contador de cajas 2D.
- Corregir el plugin: la tarea de sincronización pertenece a `withAppBuildGradle`, no al resultado del manifiesto. Incluir el archivo nuevo de diagnóstico tanto en prebuild como en la copia Gradle.

### Cómo recoger evidencia

Reiniciar el backend, instalar Android con `npx expo run:android` y volver a seleccionar la referencia. La pantalla debe mostrar `AR 2026.09.15.2`. Primero encuadrar una zona amplia de la mesa hasta ver el contorno azul; luego recorrer los tres esferos quietos y regresar al primero.

Copiar desde Metro los eventos `[AR diagnóstico]` y desde el backend los `[AR_DETECT]`:

- `sesion_configurada`: modelo, cámara, resolución, FPS y profundidad.
- `seguimiento`: estado real, motivo nativo, planos y resultados pendientes, cada dos segundos.
- `proyeccion`: ID `frame`, visibles, ubicados, superficies, antigüedad, latencia y rechazos. `SIN_PLANOS`, `FUERA_DEL_POLIGONO`, `ANCLA_CAPTURA_SIN_TRACKING`, `RAYO_PARALELO` y `FUERA_DE_DISTANCIA` separan fallos antes indistinguibles.
- `candidato_creado`, `objeto_confirmado` y `objeto_reconocido`: asociación y avance del contador.
- `detector_error` y `sesion_finalizada`: fallos y resultado final.

El campo `frame` permite relacionar las cajas normalizadas del sensor de `[AR_DETECT]` con su proyección. No se guardan imágenes ni se envían diagnósticos a un servicio externo. Si Metro no está conectado, se puede recoger la misma traza nativa con `adb logcat -v time NativeArCore:I '*:S'`.

La captura del video y la revisión de código no sustituyen la validación física. Sigue pendiente confirmar tres objetos y conservar tres al volver sobre ellos.
