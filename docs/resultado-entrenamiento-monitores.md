# Resultado experimental de monitores — 2026-10-01

Se entrenó y probó una copia local del detector existente. **No está lista para conteo casi infalible en el aula.** Mejoró en varios ejemplos, pero conserva omisiones y duplicados. La versión estable no se reemplazó y no se instaló otra APK.

Actualización posterior: se recuperó y reinstaló la APK release antigua del 25/09; no se generó una APK nueva. Se corrigió el procesamiento compartido de monitores y la confirmación en el borde. Las dos fotos ahora dan 6/6 y 9/9 en foto y al completar la confirmación del recorrido. Sin embargo, el filtro más estricto empeora la recuperación de monitores solapados del video corto. Se mantiene experimental y **no se recomienda promoverlo a main como mejora general**. Los apartados siguientes conservan las mediciones anteriores para trazabilidad; la comparación actual se detalla al final.

## Qué se conservó

Rama `feature/dataset-feedback`. Modelo inicial: `backend/yolov8n.pt` (6,55 MB); se copió byte a byte antes de entrenar. SHA-256 original, verificado al terminar: `f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36`. Los pesos de YOLO-World no fueron modificados. Git no incluye los archivos de modelos: la separación está en sus rutas, no solo en la rama.

Todos los medios, etiquetas y resultados privados están en `media-entrenamiento/experimento-monitor/`, excluidos de Git. No se enviaron fotos o videos a ningún servicio externo.

## Datos y ejecución

- 5 fotos + 4 cuadros del video largo para entrenamiento; 31 cajas de monitores.
- 5 recortes negativos de ese mismo material: silla, mesas/sillas, portátil, teclado/mouse y caja eléctrica.
- 1 foto de validación con 6 monitores, usada para selección de pesos y confianza.
- 4 cuadros del video corto no usados para entrenar, anotados con 6, 8, 4 y 5 monitores visibles.
- Una foto de lejos queda fuera de las métricas por oclusión ambigua.
- Etiquetas revisadas visualmente por el asistente; falta segunda revisión humana. No constituyen una certificación de verdad de terreno.
- Fotos/videos muestran escenas relacionadas del mismo aula. Además, los resultados del video reservado se inspeccionaron durante el desarrollo. Se reportan como diagnóstico, **no como evaluación ciega ni prueba de generalización**.

Se ejecutaron tres pruebas. La final (v3) empleó YOLOv8n con una sola clase `monitor`, backbone congelado, CPU, dos hilos de entrenamiento, batch 1, tamaño 640, workers 0, sin cache de imágenes, AdamW y semilla 42. Terminó en 55 épocas por parada temprana; checkpoint seleccionado de la época 40. Duración medida: **404,7 segundos**. Una muestra del proceso durante la ejecución mostró aproximadamente 510 MB RAM, no un pico garantizado. Las dos pruebas previas duraron unos 61 y 78 segundos.

## Comparación del detector aislado

Base: YOLOv8n original, tamaño 640, confianza 0,25, NMS IoU 0,7. Copia v3: tamaño 640, confianza 0,7, NMS IoU 0,45. La confianza se eligió entre siete valores usando exclusivamente la foto de validación. Por tanto se comparan **dos configuraciones completas**, no solo el efecto de cambiar pesos. La app original también usa YOLO-World y otras heurísticas: esta tabla no mide su rendimiento completo.

| Imagen | Uso | Anotados | Original | Copia v3 |
| --- | --- | ---: | ---: | ---: |
| Monitor de frente | Entrenamiento | 1 | 0 | 1 |
| Monitor de perfil | Entrenamiento | 1 | 0 | 1 |
| Monitor de un lado, con otro parcialmente visible | Entrenamiento | 2 | 0 | 1 |
| Monitor por detrás, con dos al fondo | Entrenamiento | 3 | 0 | 3 |
| Varios monitores 2 | Validación/calibración | 6 | 2 | 6 |
| Varios monitores | Entrenamiento | 9 | 3 | 12 |
| Video corto, 0,93 s | Diagnóstico | 6 | 5 | 3 |
| Video corto, 3,27 s | Diagnóstico | 8 | 4 | 9 |
| Video corto, 5,60 s | Diagnóstico | 4 | 0 | 2 |
| Video corto, 7,93 s | Diagnóstico | 5 | 4 | 3 |

En los cuatro cuadros del video corto, usando coincidencia de cajas IoU >= 0,5:

- Original: 11 verdaderos positivos, 2 falsos positivos y 12 omisiones; precisión 84,6 %, recuperación 47,8 %; error absoluto medio de conteo 2,5.
- Copia v3: 15 verdaderos positivos, 2 falsos positivos y 8 omisiones; precisión 88,2 %, recuperación 65,2 %; error absoluto medio 2,0.
- Ninguno acertó el total exacto en esos cuatro cuadros. Algunos cuadros empeoraron.

Los cuatro cuadros del video largo usados para entrenar dieron 4/4, 4/4, 3/3 y 4/4; **son resultados sobre material aprendido**. Los cinco recortes negativos dieron cero detecciones, también sobre material aprendido. No convertir esos aciertos en una tasa de precisión para nuevas aulas.

## Artefactos locales

- Pesos: `media-entrenamiento/experimento-monitor/runs/monitor-cpu-v3/weights/best.pt`.
- Configuración exacta y época: `runs/monitor-cpu-v3/args.yaml` y `results.csv` dentro del experimento.
- Etiquetas/fuentes: `annotations.json`, `manifest.json`, `monitor-cpu-v3-dataset-snapshot.json`.
- Calibración: `calibration-v3/selection.json`.
- Predicciones y evaluación: `candidate-v3-final/predictions.json`, `evaluation.json` e imágenes anotadas.
- Videos: `videos-v3/video_00.mp4` (corto, 19 cuadros) y `video_01.mp4` (largo, 73 cuadros). Muestreo a 2 fps, sin audio. **El número es el total visible por cuadro, no un acumulado de monitores únicos.**
- Prueba de API: `api-smoke.json`. Entorno instalado: `environment.txt`.

## Integración y comprobaciones

El backend permite activar explícitamente la copia con `MONITOR_MODEL_PATH`, `MONITOR_CONFIDENCE=0.7`, `MONITOR_IMGSZ=640`. Se carga una vez. El texto del usuario (`monitor`/`monitores`) decide la ruta, sin un clasificador adicional. La referencia conserva el texto original para que un pedido de televisor no se convierta accidentalmente en monitor por los alias históricos de COCO. Las demás rutas y el arranque sin esa variable conservan el comportamiento original.

Las 16 pruebas del backend pasaron. Se probó por HTTP real `/health`, `/count-image`, `/identify` y `/detect`: la foto de validación devolvió 6 tanto en foto como en cámara, con la ruta experimental. El servidor temporal de puerto 8001 se detuvo para liberar recursos. No se cambió la configuración guardada del teléfono.

Para repetir una prueba local desde la raíz:

```powershell
.\training\start-monitor-backend.ps1 -Weights .\media-entrenamiento\experimento-monitor\runs\monitor-cpu-v3\weights\best.pt
```

En otra terminal:

```powershell
.\object-counter-app\yolovenv\Scripts\python.exe training\smoke_monitor_api.py
```

El servidor experimental escucha solamente en localhost:8001. Para probarlo por USB con la APK existente, ejecutar `adb reverse tcp:8001 tcp:8001` y configurar explícitamente `http://127.0.0.1:8001` en la app. Esto requiere mantener la laptop/servidor disponibles; los pesos no se incorporaron a la APK. Al terminar, restaurar la dirección anterior si se cambió y detener el servidor.

## Lo que falta para mañana

Comprobación adicional del flujo de la app: `training/check_app_counting_flow.py` envía el archivo original a `/count-image`, crea referencia con selección y abre una sesión de barrido. Envía cinco cuadros idénticos con JPEG calidad 80 (aproximación a la compresión de Expo; no equivalencia byte a byte ni captura física). Resultados en `app-flow-results.json`:

| Archivo original | Anotados | Foto | Total confirmado en barrido (5 cuadros) |
| --- | ---: | ---: | --- |
| varios monitores 2.jpeg | 6 | 6 | 0, 6, 6, 6, 6 |
| varios monitores.jpeg | 9 | 11 | 0, 8, 8, 8, 8 |

El primer cuadro inicia candidatos; el segundo los confirma. La foto con 9 incluye un monitor cortado por el borde: el seguimiento actual exige cajas completas alejadas del borde. Los cuadros de ese barrido traen 9 detecciones pero solo 8 confirmaciones. Los resultados de foto difieren de la tabla anterior porque esta prueba usa los JPEG originales, mientras el experimento anterior usó copias normalizadas/recomprimidas. Esto también evidencia sensibilidad a la codificación de imagen. No confundir este ensayo con apuntar físicamente el teléfono a una pantalla ni con un recorrido real en el aula.

1. Revisar las cajas anotadas y corregir posibles ambigüedades, especialmente monitores parcialmente visibles.
2. Obtener más fotos de monitores pequeños/de perfil/ocultos, con fondos y encuadres variados; más ejemplos de televisores, portátiles y otros objetos que no son monitores. No limitarse a extraer cuadros casi idénticos.
3. Reservar nuevas capturas completas para evaluación antes de incorporarlas al dataset. Las capturas de mañana pueden servir como esa prueba independiente.
4. Corregir duplicados sin fusionar monitores reales solapados. No añadir reglas que solo cuadren con estas fotos.
5. Validar por separado el recorrido con objetos a diferentes profundidades: el seguimiento actual asume aproximadamente un plano. Entrenar el detector no elimina esa limitación.

Hasta resolver esto, usar la copia para pruebas supervisadas y revisar los recuadros, no como sustituto fiable del conteo manual.

Referencia de los parámetros de entrenamiento: https://docs.ultralytics.com/modes/train/

## Corrección de duplicados y borde (posterior al entrenamiento)

| Escena original | Foto antes | Foto ahora | Recorrido antes | Recorrido ahora |
| --- | ---: | ---: | ---: | ---: |
| 6 monitores | 6 | 6 | 6 | 6 tras 2 cuadros |
| 9 monitores | 11 | 9 | 8 | 9 tras 3 cuadros |

En la segunda escena, los monitores pequeños y solapados generaban hipótesis adicionales sobre los mismos objetos. Foto y cámara usaban filtros de duplicados diferentes. Se unificó NMS a IoU 0,45 y se agregó Soft-NMS gaussiano, sigma 0,5, que reduce puntuaciones de hipótesis solapadas antes del umbral final 0,7. Referencia del método: https://arxiv.org/abs/1704.04503 . No se cambió el total a mano ni se añadieron reglas por nombre de foto.

El monitor grande cortado por el borde se detectaba, pero el seguimiento no lo confirmaba. Ahora solo las sesiones del detector experimental admiten confirmar esas cajas tras tres observaciones consecutivas con registro visual válido. Se probó el cambio de parcial a completo conservando el mismo ID; las pruebas sintéticas no validan todos los movimientos reales del aula.

Pasaron 21 pruebas de backend y la prueba HTTP del flujo completo de foto/referencia/sesión/barrido. `app-flow-results-fixed.json` conserva el resultado. La variante no es una mejora universal: en los cuatro cuadros diagnósticos del video corto, pasó de 15 a 13 verdaderos positivos (de 23), con 2 falsos positivos y 10 omisiones; error medio 2,0, igual al anterior. El video de 3,27 s pasó de 9 detecciones a 7 y perdió detecciones correctas. Falta resolver esa regresión antes de promover el cambio. Evaluación en `soft-only-0.5/evaluation.json` (reaplicación del filtro sobre las cajas guardadas de v3; configuración y procedencia en settings.json) y videos actualizados en `videos-postprocess-final/`.

La APK recuperada está en `artifacts/release/app-release.apk`, reinstalada y abierta por USB. Su SHA-256 coincide con la APK release dentro del `.tar.gz`; el contenedor también incluye una APK debug. El perfil `preview` ahora selecciona solo el archivo release, según https://docs.expo.dev/eas/json/ . No se hizo un nuevo build remoto para verificar el formato de descarga futuro.
