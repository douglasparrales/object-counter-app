# Mouse ampliado y distribución — 01/10/2026

Se completó la ronda `aula-mouse-v4`. Es un candidato experimental de dos clases, no un detector infalible. Se conserva monitores v3 para volver a la versión anterior.

## Datos y entrenamiento

El usuario confirmó 13 objetos en `varios mouses.png` y 26 en `varios mouses en aula.jpg`, incluidos parcialmente visibles. Se anotaron las 39 cajas nuevas y se añadieron al entrenamiento de una nueva versión: `media-entrenamiento/experimento-aula-v2/`. La foto de 26 es de 335×597 píxeles; las cajas de los objetos superpuestos son aproximadas y requieren segunda revisión.

Se conservaron las divisiones anteriores: entrenamiento 19 imágenes, 31 monitores y 55 mouse; validación 2 imágenes, 6 monitores y 4 mouse; diagnóstico 5 imágenes, 23 monitores y 6 mouse. Ambas imágenes nuevas se usaron para entrenar. Sus resultados no miden generalización a escenas nuevas. Las fuentes, cajas y hashes quedan en annotations.json, manifest.json y aula-mouse-v4-snapshot.json dentro del experimento privado.

Punto de partida: aula-cpu-v3 (dos clases), sin sobrescribirlo. Entrenamiento: 70 épocas, 640 px, dos hilos CPU, batch 1, workers 0, freeze 10, AdamW lr 0,0005, 631 s (~10,5 min). Los hashes de los pesos protegidos siguieron iguales. Se comparó best.pt con last.pt: mismos conteos relevantes y métricas de validación calibradas; se conserva best.pt.

Configuración elegida con validación: confianza monitor 0,70, mouse 0,85, NMS IoU 0,45. Se comprobó 960 px y se descartó: empeoró la validación y no recuperó los tres mouse omitidos. Los reportes están en candidate-v4, candidate-v4-last y candidate-v4-960. No se modificaron totales manualmente.

## Resultados

| Entrada | Esperado | Modelo anterior aislado | Candidato por API, foto |
| --- | ---: | ---: | ---: |
| Cada una de las cinco fotos cercanas | 1 | Una duplicaba | 1 en las cinco |
| Mouse ordenados | 13 | 5 | 10 |
| Mouse amontonados | 26 | 0 | 26 |
| Mouse junto al monitor de frente | 1 | 2 | 1 |
| Foto de seis monitores | 6 | 6 | 6 |
| Foto de nueve monitores | 9 | 10 | 9 |

La columna anterior usa aula-cpu-v3, no todo el sistema original general + World. Las entradas nuevas se compararon a partir de copias normalizadas; la API final recibió los archivos originales. En diagnóstico de mouse el candidato conservador acertó 1 caja, tuvo 0 falsos positivos y omitió 5; todavía falla con objetos pequeños/escenas diferentes. No presentar los aciertos de entrenamiento como precisión general.

Se probaron `/count-image`, `/identify`, `/scan/sessions` y `/detect` con imágenes originales y cuadros JPEG80 repetidos. Evidencia en api-v4/results.json. Las fotos de monitores confirmaron 6 y 9 en barrido; el monitor parcial se confirmó al tercer cuadro. Mouse sobre mesa texturizada confirmó 1; la mesa lisa siguió sin establecer seguimiento aunque veía 1.

También se extendió la admisión de objetos parciales al mouse del perfil de aula: exige tres observaciones consecutivas con registro válido. Evidencia final en api-v4-partial y api-v4-partial-repeat: la escena de 26 confirmó 25 (0→23→25→25, repetido); la de 13 confirmó 10. La prueba anterior a esa corrección confirmó 24 en la de 26. El acierto 26 en foto no equivale a 26 en recorrido. No hubo prueba óptica con la cámara ni movimiento real.

## Archivos para una clonación

- `backend/models/monitor-v3.pt`: versión anterior conservada.
- `backend/models/classroom.pt`: copia exacta del candidato aula-mouse-v4; SHA-256 `84a8e8537b05d7cec365f04fcc2facd9b68ddc1cad144cfeacea1621683e6b8e`.
- `backend/models/profiles.json`: hashes, clases implícitas por tipo y umbrales. Dos checkpoints suman aproximadamente 12,5 MB.
- `training/serve_backend.py`: arranque portable con perfil `monitores`, `aula` u `original`; no depende de media-entrenamiento ni de la ruta local del autor.
- `backend/constraints-inference.txt`: versiones usadas para la verificación.

Las fotos privadas, anotaciones completas y checkpoints intermedios permanecen fuera de Git y se conservan en archivos de recuperación locales. Son necesarios para repetir exactamente el entrenamiento, no para contar con los pesos distribuidos. Git solo traslada a main lo que se versione y se integre; esta rama no se fusionó automáticamente.

Siguen pendientes la omisión de tres mouse de la imagen ordenada, las omisiones en escenas nuevas y los límites del seguimiento con fondos lisos/oclusiones. Esta ronda está finalizada y reproducible, pero no justifica conteos sin supervisión.

Verificación de distribución: pasaron 26 pruebas del backend. Una clonación local sin media-entrenamiento verificó ambos hashes y arrancó con el lanzador portable. Reprodujo 26 mouse y 6 monitores en foto, y acumulados 25 y 6 en barrido. Se reutilizaron el entorno Python instalado y la caché de YOLOv8n/World; no fue una instalación nueva de dependencias. Evidencia privada en clone-api-ready/results.json. Los servidores temporales se detuvieron al terminar.
