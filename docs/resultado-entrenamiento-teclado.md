# Resultado: monitores, mouse y teclados

## Uso

En la app escribe **monitor**, **mouse** o **teclado**. `aula` es el nombre del perfil del backend, no una categoría ni el nombre que debes poner a todos los objetos. La APK existente sirve; el aprendizaje se ejecuta en el servidor.

Desde la raíz, con el entorno Python activado:

```powershell
python training/serve_backend.py --profile aula --host 0.0.0.0 --port 8000
```

## Configuración elegida

- Monitor: conserva aula-mouse-v4, confianza 0,70. El candidato nuevo perdía más monitores pequeños en el video, por eso no sustituye esta ruta.
- Mouse: conserva las detecciones de v4 a 0,85 y añade las de v6 a 0,55 cuando no coinciden espacialmente. IoU >=0,35 o contención >=0,8 identifica duplicados. Son dos inferencias pequeñas; los pesos se cargan una vez, sin alternar modelos por ensayo.
- Teclado: aula-keyboard-v6, confianza 0,75 y Soft-NMS gaussiano sigma 0,5 para reducir fragmentos duplicados. Una inferencia.
- Los otros objetos mantienen las rutas originales de YOLOv8n y YOLO-World. No se han añadido a este dataset las 80 categorías de COCO.

`aula-anterior`, `monitores` y `original` permiten comparar versiones. El modelo nuevo está en backend/models/classroom.pt; el anterior de aula en classroom-v4.pt. profiles.json registra hashes y parámetros. No se guardan pesos en SQLite y una corrección manual en la app no desencadena entrenamiento automático.

## Datos y entrenamiento

Las carpetas originales monitor/, mouse/ y teclado/ organizan aportes. El dataset nuevo **experimento-aula-v4** contiene 31 archivos: 29 fotos, recortes o fotogramas base y dos rotaciones de imágenes de entrenamiento. No son 31 capturas independientes. Las etiquetas indican monitor=0, mouse=1 y keyboard=2. Una misma imagen puede contener las tres clases. Se excluyen teclados integrados en portátiles.

División: 23 archivos train, 3 val y 5 test diagnóstico. Se conservaron todas las imágenes previas y sus cajas; se añadieron teclados visibles y se corrigió una caja parcial. Las escenas, recortes y objetos se relacionan entre sí; test no es un benchmark independiente de otra aula. Las cajas de objetos pequeños/ocultos son aproximadas y necesitan segunda revisión humana.

V5 amplió el checkpoint de mouse: 80 épocas, 1065 segundos; produjo teclados fragmentados y se descartó. V6 partió de una copia del YOLOv8n original, conservando en el dataset los ejemplos de las tres clases: 60 épocas, 705 segundos. Ambos usaron CPU, dos hilos, batch 1, imagen 640 y backbone congelado. Los pesos protegidos conservaron sus hashes.

**La configuración distribuida es un punto de operación ajustado con validación y regresiones sobre imágenes conocidas.** No corresponde simplemente al máximo F1 de validación: prioriza evitar duplicados en primeros planos y conservar los conteos anteriores. Se publican también los umbrales automáticos y métricas completas en training/reports/aula-v4-evaluation.json. Los aciertos en imágenes de entrenamiento no demuestran generalización; confianza 0,75 tampoco significa 75% de exactitud.

## Prueba por la API de la APK

Se usan los archivos originales en /count-image, y /identify → /scan/sessions → /detect para cuatro cuadros repetidos con JPEG80 y lado máximo 1280. Se comprobó el objetivo, la ruta y la correspondencia de cajas con IoU 0,5.

| Escena | Esperado | Foto original | Total confirmado en barrido |
| --- | ---: | ---: | ---: |
| Monitor: grupo de 6 | 6 | 6 | 6 |
| Monitor: grupo de 9 | 9 | 9 | 9 |
| Mouse individuales, cinco fotos | 1 cada una | 1 cada una | 1 en las dos probadas |
| Mouse ordenados | 13 | 13 | 13 |
| Mouse superpuestos, imagen 335×597 | 26 | 26 | **25** |
| Teclado horizontal | 1 | 1 | 1 |
| Teclado individual | 1 | 1 | 1 |
| Tres teclados | 3 | 3 | 3 |

Las dos variantes giradas también dieron 1 y 3 en foto y barrido. Son pruebas de desarrollo. No se filmó un recorrido físico nuevo en el aula. La imagen comprimida de 26 mouse conserva una omisión; no se fuerza el total a 26.

El registro ahora reintenta SIFT sobre detalles débiles del fondo cuando la extracción inicial no alcanza 40 puntos. Limita a 1600 descriptores después de aplicar la máscara. Mantiene la exclusión de objetos, las 18 coincidencias mínimas y los controles de geometría; un fondo sin información sigue pausando incorporaciones. Esto corrigió los totales cero de imágenes llenas de teclados y mouse sin cambiar el significado del total acumulado.

## Límites fuera de los primeros planos

Resultados sobre los cinco archivos de diagnóstico relacionados, incluyendo cuatro cuadros del video:

| Clase | Cajas acertadas | Falsos positivos | Omisiones |
| --- | ---: | ---: | ---: |
| monitor | 10 | 1 | 13 |
| mouse | 3 | 3 | 3 |
| keyboard | 0 | 2 | 16 |

Estos resultados muestran que todavía faltan ejemplos de objetos pequeños, lejanos y ocluidos. **No se declara 100% de precisión ni se da por resuelto el conteo de todo el aula.** La siguiente ronda debe añadir escenas nuevas reservadas para evaluación, con mayor resolución y variedad de distancias.

## Recuperación y continuidad

Se conservan los experimentos de monitores y aula v1/v2/v3/v4. Cada versión contiene annotations.json, classes.json, dataset.yaml, manifest.json, snapshots, ejecuciones y evaluaciones. Las fotos y los videos siguen ignorados por Git; los checkpoints seleccionados, código, parámetros e informes sí se distribuyen. Una clonación puede inferir sin las imágenes privadas; para repetir el entrenamiento necesita el archivo privado correspondiente.

Las copias verificadas se guardan en media-entrenamiento/backups/. Son copias locales en el mismo disco. No se generó una APK nueva.


## Verificación de clonación

Comprobado desde un checkout limpio del commit 07bb913 sin media-entrenamiento/: el lanzador verificó los hashes, inició el backend y reprodujo los 15 casos de foto (dos son rotaciones), todos con conteo y cajas correctos. De 11 replays de barrido, diez coincidieron y el de mouse densos quedó en 25/26. Se reutilizó el entorno Python instalado y los pesos generales ya descargados; no se repitió una instalación de paquetes desde cero. Resultados portables: training/reports/aula-v4-api.json. Pasaron 31 pruebas de backend.

Las copias de recuperación incluyen RECOVERY-PARENTS.json, que localiza los pesos de partida por hash aunque el archivo distribuido se haya sustituido después. Los comandos y el registro de modelos permiten continuar sin confundir checkpoints.
