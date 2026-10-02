# Cómo conservamos y ampliamos el reconocimiento

La APK local recuperada tiene fecha 25/09/2026. Es la más reciente encontrada en el proyecto, no una auditoría de todos los builds de EAS. Sigue siendo compatible: envía las imágenes al backend. Los pesos se cargan en el servidor, no dentro de esta APK. Cambiar el detector del servidor no requiere por sí solo un nuevo build móvil.

## Dataset, pesos y base de datos son cosas distintas

- **Dataset:** fotos y cuadros de video más etiquetas que indican la clase y el rectángulo de cada objeto. Una carpeta llamada mouse no sustituye esas cajas.
- **Pesos (`best.pt`):** parámetros que el entrenamiento ajusta. Es el archivo que el detector utiliza para reconocer imágenes nuevas; no consulta una galería de fotos en cada conteo.
- **Registro del experimento:** modelo de partida, configuración, versiones, etiquetas, hashes y resultados. Permite saber de dónde salió cada versión y reproducirla.
- **Base de datos:** podría organizar futuras aportaciones de usuarios, correcciones y revisiones. Hoy el experimento usa archivos JSON, TXT y YAML; no necesita una base de datos para guardar lo aprendido.

La app sí usa SQLite para su historial de conteos. Ese historial es distinto de los pesos y del dataset: guardar un conteo o corregir su número no entrena automáticamente al detector. Desinstalar la app puede borrar ese historial del teléfono, pero no borra los experimentos guardados en la laptop.

## Qué había y qué estamos cambiando

La app original usa dos modelos en el backend: YOLOv8n entrenado previamente con las 80 clases de COCO y YOLO-World v2 para detección guiada por texto. Los arrays de nombres sirven para elegir categorías o describir la búsqueda; no contienen fotos ni entrenan el modelo. El dataset COCO completo no se descargó ni se copió en este trabajo.

El experimento de monitores ajustó una copia de YOLOv8n con imágenes propias y una clase `monitor`. Sus pesos originales siguen intactos. El siguiente dataset mantiene las imágenes y etiquetas de monitores, incorpora las de mouse y revisa también los mouse visibles en las fotos anteriores. La nueva configuración usa `0: monitor`, `1: mouse`.

Se comparan dos maneras de inicializar el candidato de dos clases: transferir desde monitores v3 o desde YOLOv8n general. Al cambiar la cantidad de clases se adaptan las capas de salida; no equivale a añadir filas a una lista ni garantiza conservar todo el comportamiento. El historial y las etiquetas de monitores se preservan en ambos casos. La retención se comprueba volviendo a medir monitores.

El detector de aula de dos clases no reemplaza por sí solo las 80 clases de COCO. Su integración es opcional (`CLASSROOM_MODEL_PATH`): atiende monitor/mouse según el texto original pedido; las demás categorías conservan las rutas anteriores. YOLO-World no se reentrenó. El arranque de aula carga los dos modelos originales más un candidato de aula, no un modelo nuevo por cada categoría; no se descarga/carga entre cuadros. El arranque experimental de monitores sigue disponible por separado.

## Dónde está cada cosa

Rutas relativas a la raíz del proyecto:

| Contenido | Ubicación |
| --- | --- |
| Fotos y videos originales | `media-entrenamiento/monitor/`, `mouse/`, `teclado/` |
| Experimento de monitores preservado | `media-entrenamiento/experimento-monitor/` |
| Pesos de monitores v3 | `experimento-monitor/runs/monitor-cpu-v3/weights/best.pt` dentro de la carpeta anterior de medios |
| Dataset monitor + mouse | `media-entrenamiento/experimento-aula-v1/dataset/` |
| Cajas revisadas y división de datos | `experimento-aula-v1/annotations.json` |
| Procedencia e integridad de archivos | `experimento-aula-v1/manifest.json`, `*-snapshot.json` |
| Pesos/configuración/métricas por ejecución | `experimento-aula-v1/runs/<nombre>/` |
| Evaluación y fotos con predicciones | `experimento-aula-v1/<evaluación>/` |
| Copias locales verificadas | `media-entrenamiento/backups/` |
| Scripts y documentación | `training/`, `docs/` |

Todos estos archivos persisten al cerrar la app o apagar el servidor. Las referencias y sesiones de recorrido en memoria del backend sí son temporales y no son entrenamiento.

## Continuar sin perder versiones

1. Conservar originales y procedencia. Anotar todas las clases visibles que se entrenarán; un mouse sin etiqueta puede convertirse en una señal de fondo equivocada.
2. Crear una versión nueva del dataset cuando se cambien etiquetas o divisiones. No mezclar cuadros vecinos entre conjuntos para anunciar una evaluación independiente.
3. Mantener ejemplos de las clases anteriores, entrenar en una carpeta de ejecución nueva y registrar pesos de partida y hashes.
4. Calibrar con validación y evaluar por clase: aciertos de cajas, falsos positivos, omisiones y conteos. Probar además los endpoints de foto y recorrido.
5. Conservar el candidato anterior hasta demostrar que el nuevo sirve. No convertir predicciones automáticas en etiquetas verdaderas sin revisión.
6. Archivar al terminar: `training/archive_experiment.py --experiment media-entrenamiento/experimento-aula-v1 --name aula-v1-recovery.zip` usando el Python del proyecto.

**Actualización para distribución:** Git incluye ahora tres checkpoints seleccionados en `backend/models/`, junto con hashes, perfiles y el lanzador portable `training/serve_backend.py`. Las fotos y los checkpoints intermedios siguen ignorados. El dataset privado no se necesita para inferencia; sí para repetir exactamente el entrenamiento. Publicar la rama transporta los archivos versionados, y solo su futura integración los incorpora a main.

Las copias ZIP verificadas permiten recuperar experimentos completos, pero están en el mismo disco. Para protegerse de pérdida de la laptop/disco hay que copiar también `media-entrenamiento/` o sus archivos de recuperación a otra unidad o almacenamiento elegido por el usuario. No se han subido imágenes a un servicio externo.

Las escenas actuales están relacionadas entre sí. Las cinco fotos de mouse muestran dos tipos de ratón y no constituyen una prueba independiente de conteo de varios mouse. Se necesita una segunda revisión de etiquetas y capturas nuevas para evaluar generalización.

Fuentes: [entrenamiento y checkpoints de Ultralytics](https://docs.ultralytics.com/modes/train/), [clases de COCO](https://docs.ultralytics.com/datasets/detect/coco/). La descripción de la integración proviene del código local.


## Ampliación de teclados y nuevas versiones

Las versiones de aula v3 y v4 añaden la clase `keyboard=2`, que en la app se solicita como `teclado`. Los IDs anteriores siguen siendo monitor=0 y mouse=1. `classes.json` permite que el script lea las clases de cada versión sin reinterpretar los datasets históricos de dos clases. El nombre aula agrupa el dominio del experimento, no sustituye el nombre de los objetos.

Para continuar: crear otra carpeta de experimento, copiar las anotaciones previas y añadir/corregir las nuevas; mantener separados los grupos de captura; ejecutar prepare, train y evaluate con `--work` apuntando a esa nueva versión. Conservar el checkpoint de partida e incluir fotos anteriores evita entrenar únicamente con la última categoría, aunque no garantiza por sí solo que no haya regresiones. Comparar después todas las clases y probar el flujo HTTP antes de cambiar profiles.json.

El informe `docs/resultado-entrenamiento-teclado.md` registra los candidatos aceptados y descartados. Clonar los pesos permite **usar** el aprendizaje sin las fotos; para repetir o ampliar el entrenamiento con los mismos ejemplos hace falta recuperar también el archivo privado del dataset.
