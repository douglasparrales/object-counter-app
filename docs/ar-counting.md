# Conteo espacial — decisión e implementación (2026-09-15)

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
