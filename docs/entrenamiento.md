# Entrenamiento con imágenes reales

## Acuerdos y estado — 2026-10-01

- Rama: `feature/dataset-feedback`, creada desde `main` (a97450e). El usuario pide usar `feature/`, nunca `codex/`, para nuevas ramas de este trabajo.
- Entrenamiento por lotes con fotos revisadas; no entrenamiento en tiempo real durante el conteo.
- Empezar por monitores, después mouse y teclado. Material real tomado por un amigo del usuario.
- Datos locales en `media-entrenamiento/`, excluidos de Git. No subir fotos ni videos a servicios externos como parte de esta preparación.
- Inventario inicial: monitor: 7 JPEG y 2 MP4; mouse: 5 JPEG; teclado: 2 JPEG. Se revisó y etiquetó material de monitores; mouse y teclado quedan pendientes.
- Se entrenaron copias experimentales de YOLOv8n; los pesos originales se conservan. La activación en el backend es opcional mediante `MONITOR_MODEL_PATH`; el arranque normal mantiene la inferencia original.
- Teléfono comprobado por ADB: Samsung SM_A266M, APK `com.gokudouglas.objectcounterapp` instalada.
- Entorno existente `object-counter-app/yolovenv`: ultralytics 8.4.75, torch 2.12.1+cpu, CUDA no disponible en ese entorno. Esto no demuestra que el equipo carezca de GPU física.

## Hallazgos del código

El backend carga `yolov8s-worldv2.pt` y `yolov8n.pt`. Las referencias visuales viven en memoria; no actualizan pesos. Los reportes de fotos guardan imágenes, detecciones originales y confirmadas en el dispositivo. Los objetos añadidos manualmente heredan el ancho y alto de la selección de referencia: sus cajas requieren revisión antes de convertirse en etiquetas.

## Propuesta técnica (pendiente de implementación)

Priorizar dataset revisado + reentrenamiento por versiones. Guardar una corrección permite recuperar el resultado de esa imagen, pero no enseña a generalizar. Una biblioteca de ejemplos visuales es una opción posterior a evaluar, no una garantía de reconocer nuevas escenas.

Para preservar las capacidades actuales, conservar los pesos originales y evaluar una copia especializada en monitores. Se propone usarla solo para la categoría monitor si supera las pruebas, manteniendo las rutas originales para otras categorías. La integración también debe probarse: no basta con conservar archivos de pesos. No sustituir globalmente el detector por una copia entrenada solo con monitores.

## Siguiente secuencia

1. Revisar imágenes y videos de monitores; definir qué cuenta como monitor (incluidas vistas posteriores y exclusión de televisores/portátiles) y conteos reales.
2. Medir el resultado actual en fotos; registrar cajas, omisiones, falsos positivos, conteo y tiempo.
3. Agrupar por escena/sesión de captura antes de separar entrenamiento, validación y prueba. Comprobar si fotos y videos muestran el mismo lugar/objetos; cuadros vecinos nunca deben repartirse entre conjuntos. Si no hay escenas independientes, pedir nuevas capturas para la evaluación.
4. Extraer cuadros diversos de un video, revisar todas las cajas de monitores y conservar un video/escenas independientes para evaluación. Siete fotos sirven para diagnosticar, no para prometer generalización.
5. Entrenar una copia con dataset y configuración versionados, sin sobrescribir pesos actuales. Decidir CPU/GPU después de dimensionar la prueba.
6. Comparar detector y sistema completo con los mismos datos reservados: precisión/recobrado, error absoluto del conteo, proporción de fotos con total exacto, latencia y regresiones en otras categorías.
7. Evaluar el video por separado: objetos visibles por cuadro y total de monitores físicos únicos del recorrido son métricas distintas. Duplicados al mover la cámara pueden exigir cambios de seguimiento.
8. Integrar únicamente una versión validada con posibilidad de volver a la original.

En una fase posterior, permitir aportaciones voluntarias desde la app con foto original, categoría, predicción, cajas corregidas, versión de modelo y estado pendiente/revisado/rechazado. No convertir predicciones sin revisión en verdad de entrenamiento. Las imágenes de Internet podrán complementar los datos reales, con procedencia y permisos de uso registrados; no reemplazarán las pruebas con escenas reales.

## Fuentes

- Entrenamiento de YOLO-World v2: https://docs.ultralytics.com/models/yolo-world/
- Formato de detección YOLO: https://docs.ultralytics.com/datasets/detect/
- Olvido e interferencia en detección continua: https://arxiv.org/abs/2403.14797

## Sesión de entrenamiento — continuidad

Objetivo de producto aclarado por el usuario: aula universitaria de informática (monitores, mouse, teclados, sillas y torres de computador), incorporando categorías gradualmente. Plan propuesto: evolucionar hacia un detector de aula con varias clases entrenadas conjuntamente; no crear indefinidamente un modelo por cada objeto. Al añadir mouse/teclado, conservar y evaluar también los ejemplos de monitores. La copia v3 actual solo tiene una clase y NO puede sustituir sin más al detector original de 80 clases.

El usuario confirmó que monitor incluye vistas traseras y oclusiones, y excluye portátiles, televisores y la caja eléctrica de la pared. Su prioridad es probar mañana en el aula. No prometer 100 %: el dataset es pequeño y las escenas de prueba pertenecen al mismo aula.

Equipo: Intel Core i3-1005G1, 4 procesadores lógicos, aproximadamente 8 GB RAM, Intel UHD integrada. Se usa CPU, batch=1, workers=0, sin cache de imágenes y con backbone congelado. El proceso v3 se observó alrededor de 510 MB RAM (muestra puntual, no pico garantizado).

Datos y resultados privados: `media-entrenamiento/experimento-monitor/`. Scripts reproducibles en `training/`. Anotaciones realizadas y revisadas visualmente por el asistente, pendientes de una segunda revisión humana. Cajas de la carcasa de pantalla, sin exigir incluir la base; se anotan partes visibles de monitores ocluidos. `photo_04` se excluye de entrenamiento/métricas por oclusión ambigua, aunque se generan predicciones de diagnóstico.

- Entrenamiento inicial: 5 fotos + 4 cuadros del video largo (31 instancias).
- Validación: `photo_05`, 6 monitores; se usa para selección de checkpoint y umbral.
- Diagnóstico reservado: 4 cuadros del video corto, con 6, 8, 4 y 5 monitores visibles anotados. Nunca entran al entrenamiento, pero ya se inspeccionaron resultados durante el desarrollo: no presentarlos como una prueba ciega final.
- Existe relación visual entre fotos y ambos videos. No es posible construir aquí una evaluación independiente por aula/sesión. Las nuevas capturas de mañana son necesarias para esa evaluación.
- V3 añade 5 recortes negativos de imágenes de entrenamiento: sillas, portátil, caja eléctrica y teclado/mouse. No usa recortes de validación o prueba.
- V1: 20 épocas a 416 px, ~61 s; insuficiente.
- V2: hasta 60 épocas a 416 px, parada temprana en 33, ~78 s. A 640 px/confianza 0.25 generó numerosos duplicados. Calibrada a 416/confianza 0.6/IoU NMS 0.45: 6/6 en validación, pero diagnóstico de video 4, 9, 2, 4 frente a 6, 8, 4, 5. No satisface el requisito de casi no fallar.
- V3: 640 px con negativos, parada temprana en época 55, mejor checkpoint de época 40; 404,7 s. Configuración elegida en validación: confianza 0,7, NMS IoU 0,45. Validación 6/6; video corto 3, 9, 2, 3 frente a 6, 8, 4, 5. **No cumple casi infalible.** Ver `docs/resultado-entrenamiento-monitores.md`.

La app ya pide el objetivo por texto. La ruta experimental admite `monitor`, `monitores`, `computer monitor(s)`. Conserva el objetivo original en la referencia porque la etiqueta COCO histórica confunde monitor con televisor. No se usa otro modelo para adivinar la intención ni se carga/descarga un modelo en cada cuadro.

No se generó una nueva APK durante este trabajo. Posteriormente se recuperó y reinstaló la APK del 25 de septiembre, como consta al final de este registro. La integración del backend se probó por HTTP con los pesos finales: foto y frame de cámara devolvieron 6 en la foto de validación; 16 pruebas de código pasaron. Se detuvo el servidor temporal para liberar recursos. Los videos anotados muestran conteo visible por cuadro, no el total de objetos físicos únicos. El seguimiento planar actual sigue sin validar para filas de monitores a distintas profundidades.

Prueba posterior del flujo real de endpoints (`training/check_app_counting_flow.py`): archivos originales para foto/referencia y JPEG calidad 80 aproximando Expo para barrido. `photo_05`: foto 6 y barrido 0→6→6→6→6. `photo_06`: foto 11 y barrido 0→8→8→8→8, con 9 cajas visibles en el barrido. El monitor grande de primer plano está cortado; SurfaceScan exige caja alejada del borde para confirmar. Esta es una prueba de API con imagen repetida, no una prueba óptica con la cámara del teléfono. Se pidió al usuario que apunte el teléfono a la imagen para completar la prueba física; no afirmar que ya se hizo sin esa colaboración/evidencia.

### Correcciones posteriores y recuperación de APK

- APK release localizada en `artifacts/release/app-release.apk`, tamaño 148035328 bytes, fecha local 25/09/2026. Coincide por SHA-256 con `release/app-release.apk` dentro de `artifacts/preview-96c14d04.tar.gz`; este también contiene la APK debug. SHA-256: `0293a47d40a8a7213d20e99c7e19d37dfd6818092c3f170346d40aac87c650bf`.
- Paquete `com.gokudouglas.objectcounterapp`, versión 1.0.0/code 1. Reinstalada por ADB con resultado Success y abierta; se verificó proceso activo. Es la APK recuperada, no un build nuevo con pesos incorporados.
- Perfil EAS `preview` restringido a APK release y ruta exacta para evitar recoger debug y release juntos. No se lanzó un build remoto nuevo.
- Filtro compartido de monitores en foto/cámara: NMS IoU 0,45 y descuento gaussiano de puntuaciones de hipótesis solapadas (Soft-NMS sigma 0,5; confianza final 0,7). Se eliminó la segunda aplicación diferente de NMS en `/detect` para monitores.
- Solo en recorridos con monitor experimental: las cajas parciales pueden confirmarse después de 3 observaciones consecutivas registradas. Repetir el mismo número de secuencia no confirma; una ausencia reinicia la evidencia tentativa. Los demás recorridos conservan su regla de borde original.
- Resultado del flujo real con estos cambios: foto de 6 → 6, recorrido 0→6→6→6→6; foto de 9 → 9, recorrido 0→8→9→9→9. Evidencia en `app-flow-results-fixed.json`, imágenes `app-flow-photo_05.jpg` y `app-flow-photo_06.jpg`.
- 21 pruebas de backend pasaron, incluyendo vecino solapado, fragmento duplicado, monitor parcial→completo conservando ID y ausencia entre confirmaciones.
- **Regresión diagnosticada:** en los cuatro cuadros del video corto, el filtro estricto conserva 13 verdaderos positivos de 23, frente a 15 de la variante v3 anterior; 2 falsos positivos, 10 omisiones, error medio 2,0. No promover a main ni afirmar una mejora general. Estos dos aciertos de foto son locales; hacen falta más ejemplos de solapamientos y una evaluación independiente. Pesos no cambiaron en esta corrección.
- Videos renderizados con el flujo compartido: `videos-postprocess-final/`, usando `render_monitor_video.py --app-pipeline`. Son conteos visibles a 2 fps, no una validación del total único del recorrido.

## Ampliación monitor + mouse — 01/10/2026

El usuario pidió conservar el avance, entender dataset/pesos/base de datos y continuar con mouse. Se mantuvo `feature/dataset-feedback`, sin modificar main ni generar una APK. La APK local del 25/09 es la última encontrada en el proyecto, sin afirmar que sea la última de toda la cuenta EAS.

Guía de almacenamiento y continuidad: `docs/como-se-guarda-el-aprendizaje.md`. Resultados completos, límites y comandos: `docs/resultado-entrenamiento-mouse.md`. Dataset nuevo: `media-entrenamiento/experimento-aula-v1/`, clases monitor=0, mouse=1. Monitores v3 y el original se conservaron por hash. Se creó una copia local verificada de monitores antes de empezar; Git no guarda medios/pesos y no se subieron datos.

El mejor candidato conjunto de esta sesión es aula-cpu-v3, inicializado desde YOLOv8n original y entrenado con los ejemplos previos de monitores más mouse. 54 épocas, mejor checkpoint 29, ~437 s. La transferencia desde monitores v3 (aula-cpu-v2) no dio un candidato mouse útil. La carpeta aula-cpu-v1 quedó parcial; no usarla como resultado final.

Resultado actual: 4/5 conteos correctos en las fotos cercanas de mouse, con tres fotos usadas para entrenamiento; la quinta duplica un objeto. Hay falsos positivos en escenas mixtas y regresiones de monitores (6 y 10 en fotos originales de 6 y 9). Mouse sobre mesa texturizada confirma 1 en barrido; mesa lisa detecta 1 pero no establece seguimiento y acumula 0. **No decir que mouse ya está resuelto ni reemplazar monitores v3 automáticamente.** La nueva integración solo se activa explícitamente con CLASSROOM_MODEL_PATH, y conserva las rutas originales para las otras categorías. Se necesita más diversidad de datos y evaluación nueva por sesión.

## Segunda ronda de mouse y clonación

El usuario añadió dos imágenes y confirmó 13 mouse ordenados y 26 amontonados. Se anotaron y entrenaron dentro de experimento-aula-v2, preservando v1. Aula-mouse-v4 finalizó 70 épocas en ~631 s. Foto por API: 5/5 individuales correctas, 26/26 amontonados, 10/13 ordenados, monitores 6 y 9. Barrido: los mouse parciales ya pueden confirmarse tras tres cuadros; escena de 26 confirma 25, escena de 13 confirma 10. No afirmar que terminó con exactitud universal. Detalle: docs/resultado-mouse-ampliado.md.

Por petición expresa del usuario, los checkpoints seleccionados se incluyen en Git bajo backend/models, con hashes y un lanzador portable. Las fotos/datasets privados y archivos intermedios siguen ignorados; clonar no permite reproducir entrenamiento sin obtener esos datos, pero sí ejecutar inferencia. Flujo real de modelos/arrays explicado en docs/flujo-deteccion.md. Publicación prevista en feature/dataset-feedback, sin fusionar main; comprobar estado Git antes de afirmar publicación.


## Teclados, conservación de clases e integración — 01/10/2026

El usuario autorizó integrar en main y publicar código/modelos en github.com/douglasparrales/object-counter-app, sin fotos/videos originales. Se entrenaron v5 y v6; v5 se descartó por fragmentos duplicados. Dataset aula-v4: 31 archivos, tres clases, historial anterior conservado. La selección usa v4 para monitores, fusión v4+v6 para mouse y v6 con Soft-NMS para teclados. El perfil aula-anterior permite recuperar el modelo previo.

Se corrigió el registro de fondos débiles manteniendo objetos enmascarados y las comprobaciones de coincidencia. Foto por API: 1/1/3 teclados, 26/13 mouse, 6/9 monitores; barrido confirma todos esos grupos salvo los mouse densos comprimidos, 25/26. Persisten omisiones importantes en objetos lejanos del video. La calibración final incluye regresiones de imágenes conocidas; no anunciar evaluación independiente ni precisión perfecta. Informe: docs/resultado-entrenamiento-teclado.md. No se generó otra APK.
