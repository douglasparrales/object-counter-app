# Checkpoints distribuidos para inferencia

Estos archivos pequeños se incluyen deliberadamente en Git. No hace falta el dataset privado para utilizarlos. `profiles.json` identifica cada checkpoint por SHA-256 y conserva los umbrales; `training/serve_backend.py` comprueba esa correspondencia antes de iniciar el backend.

- `monitor-v3.pt`: detector de una clase, monitor. Conserva el experimento anterior y su filtro de duplicados; resultados en `docs/resultado-entrenamiento-monitores.md`.
- `classroom-v4.pt`: conserva el detector anterior de dos clases y aporta las detecciones base de mouse al perfil aula.
- `classroom.pt`: candidato de tres clases, monitor=0, mouse=1 y keyboard=2. Su ejecución de origen, configuración y limitaciones están en `profiles.json` y en los informes de `docs/`. No equivale a las 80 categorías originales.

Los tres son experimentales y tienen fallos conocidos. El perfil de aula permite probar el aprendizaje nuevo; el de monitores permite volver al anterior. Los otros objetos siguen usando las rutas originales del backend. Los pesos generales `yolov8n.pt` y `yolov8s-worldv2.pt` se obtienen por separado mediante la descarga inicial de Ultralytics descrita en el README principal.

Los modelos se ajustaron localmente a partir de YOLOv8n de Ultralytics, con fotos aportadas por el usuario y anotaciones de cajas. Las escenas relacionadas y las fotos utilizadas para entrenar no constituyen un benchmark independiente. Las fuentes y etiquetas completas se conservan en los archivos de recuperación privados; no se incluyen fotografías de personas/aulas en este directorio.

Para ampliar clases, usar una nueva versión del dataset y comparar todas las categorías antes de sustituir un checkpoint. No renombrar o sobrescribir uno sin actualizar su perfil y resultados. La compatibilidad se verificó con las versiones de `backend/constraints-inference.txt`.

El perfil aula combina ambos checkpoints de aula solo para mouse; para monitor ejecuta classroom-v4.pt y para teclado classroom.pt. aula-anterior permite comparar con v4. Los resultados y el criterio de selección de umbrales están en docs/resultado-entrenamiento-teclado.md.
