# Primer candidato conjunto: monitor y mouse — 01/10/2026

Estado: **experimental, no promovido a main ni sustituto recomendado de monitores v3**. No se compiló otra APK. La integración nueva se activa únicamente con `CLASSROOM_MODEL_PATH`; el arranque normal y el experimento de monitores anterior siguen disponibles.

## Datos y conservación

Se conservaron los datos de monitores y se añadieron las cinco fotos de mouse. Se anotaron también ratones visibles en imágenes anteriores; el recorte `negative_keyboard_mouse` dejó de ser negativo para la nueva clase. Se cuenta la carcasa visible del mouse, incluida su cara inferior; el cable no forma parte de la caja.

| División | Imágenes | Monitores | Mouse |
| --- | ---: | ---: | ---: |
| Entrenamiento | 17 | 31 | 16 |
| Validación/calibración | 2 | 6 | 4 |
| Diagnóstico | 5 | 23 | 6 |

Las anotaciones fueron revisadas visualmente por el asistente, pendientes de una segunda revisión humana. Algunos mouse pequeños/borrosos de video tienen anotación provisional. Las fotos muestran los mismos ejemplares y las escenas del aula están relacionadas: no es una evaluación independiente. La división anterior de monitores se conservó. Las fotos de mouse 00, 02 y 04 entrenan; 01 calibra; 03 queda para diagnóstico. Esta división no separa ejemplares físicos y no demuestra generalización a otros tipos de mouse.

Dataset y registros en `media-entrenamiento/experimento-aula-v1/`. Antes de empezar se archivó monitores en `media-entrenamiento/backups/monitores-v3-antes-de-mouse.zip`, comprobando integridad. Los hashes de YOLOv8n original y monitores v3 permanecieron iguales tras los entrenamientos.

## Ejecuciones

- `aula-cpu-v1`: ejecución interrumpida durante la cuarta época por una comprobación de arranque que no vio a tiempo la salida almacenada en búfer. Se conservó su carpeta parcial y no se usó para seleccionar el candidato.
- `aula-cpu-v2`: transferencia desde monitores v3; 349/355 elementos transferidos al pasar de una a dos clases. Parada temprana en época 16, mejor checkpoint 4, 133 s. No detectó mouse con los umbrales evaluados; descartado para integración.
- `aula-cpu-v3`: transferencia desde YOLOv8n COCO, entrenando conjuntamente las dos clases; 319/355 elementos transferidos. Hasta 70 épocas, parada temprana en 54, mejor checkpoint 29, 436,7 s. CPU, dos hilos, batch 1, workers 0, tamaño 640, backbone congelado (freeze 10), AdamW lr 0,001. Observación puntual de RAM: aproximadamente 495 MB; no es una medida de pico.

Pesos del candidato: `runs/aula-cpu-v3/weights/best.pt` dentro del experimento. SHA-256: `ab1a241341cf280671abb4e96569660bc76c3d39920ba5954b34c89f2556a254`. Parámetros en `args.yaml`, historial en `results.csv`, versiones en `environment.json`, fotos/etiquetas exactas y pesos de partida en `aula-cpu-v3-snapshot.json`.

## Evaluación del detector

Selección de umbrales con las dos imágenes de validación solamente: monitor 0,55, mouse 0,35; tamaño 640, NMS IoU 0,45, sin Soft-NMS. Resultados en `candidate-v3/evaluation.json` y cajas en `predictions.json`.

En las cinco fotos cercanas de mouse, el detector original aislado con su configuración calibrada acertó el total en 3/5 y el candidato en 4/5. **No es una comparación del sistema original completo**, que también utiliza YOLO-World y otros filtros. Tres de las cinco fotos entraron al entrenamiento; no llamar a esto una precisión de 80 % en escenarios nuevos.

En diagnóstico (cuatro cuadros del video corto más mouse_03), el candidato obtuvo:

- Monitor: 11 aciertos de caja, 1 falso positivo, 12 omisiones; error medio de conteo 2,2 incluyendo la imagen sin monitores. Los cuatro cuadros de video dieron 2, 6, 1 y 3 frente a 6, 8, 4 y 5 anotados.
- Mouse: 4 aciertos de caja, 5 falsos positivos, 2 omisiones; error medio 0,6. Las etiquetas diminutas/provisionales limitan la interpretación; un total correcto puede ocultar una omisión y un falso positivo.

El modelo único aún tiene regresiones frente a monitores v3. No se ajustaron totales a mano ni reglas por nombre de archivo.

## Prueba por HTTP del flujo que usa la APK

Archivos originales en `/count-image`; referencia mediante `/identify`; cuadros JPEG calidad 80 repetidos en `/detect?modo=barrido` con sesión real. Es una aproximación de la compresión móvil, no captura física ni recorrido con movimiento.

| Entrada | Esperado | Foto | Acumulado de barrido |
| --- | ---: | ---: | --- |
| Mouse de frente | 1 | 1 | 0, 1, 1, 1 |
| Mouse de otro ángulo distinto | 1 | 2 | No probado |
| Mouse horizontal, mesa lisa | 1 | 1 | 0, 0, 0, 0; ve 1 pero SIN_COINCIDENCIA |
| Mouse otro ángulo | 1 | 1 | No probado |
| Mouse por debajo | 1 | 1 | No probado |
| Mouse junto al monitor de frente | 1 | 2 | No probado |
| Foto de seis monitores | 6 | 6 | 0, 5, 5, 5 |
| Foto de nueve monitores | 9 | 10 | 0, 8, 9, 9 |

Evidencia en `api-candidate-v3-final/results.json` y `api-mouse-texture/results.json`, con fotos anotadas. Se verificó que las rutas responden `aula_experimental` y devuelven solo la clase solicitada. La foto de ángulo bajo produce dos cajas sobre el mismo mouse; en la escena mixta hay un falso mouse sobre una etiqueta del fondo.

La mesa lisa no aporta suficientes características de fondo al seguimiento SIFT: el código exige al menos 40 puntos tras enmascarar las detecciones antes de inicializar el mapa. Detectar un mouse no basta para mantener identidades durante un recorrido. La imagen con mesa texturizada sí confirmó 1. No se añadió una excepción para cuadros idénticos que pudiera simular una prueba de cámara exitosa.

## Continuar

1. Revisar las etiquetas de mouse y reunir fotos con varios ratones completos, distintos modelos, tamaños en la imagen, ángulos bajos y fondos variados. Añadir fondos que hoy producen falsos positivos.
2. Reservar una nueva sesión de captura completa antes de entrenar; las actuales ya se usaron para desarrollo.
3. Crear una nueva versión del dataset manteniendo monitor=0 y mouse=1, y entrenar conjuntamente. Una futura clase teclado debe incorporarse con anotaciones completas y pruebas de retención de ambas clases anteriores.
4. Evaluar el seguimiento por separado, especialmente mesas lisas y diferentes profundidades. El candidato actual no está listo para sustituir el conteo supervisado.

Para reproducir la prueba opcional: `training/start-classroom-backend.ps1 -Evaluation media-entrenamiento/experimento-aula-v1/candidate-v3/evaluation.json`. El script comprueba el hash de los pesos y toma los umbrales de su evaluación. Escucha en localhost:8001; no cambia la configuración del teléfono y restaura las variables al salir. El script de monitores anterior permanece disponible para volver a esa versión.
