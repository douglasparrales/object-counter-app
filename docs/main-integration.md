# Integración de main con conteo persistente

## Cierre de la fase, 24 de septiembre

El usuario autorizó completar la integración con la validación física disponible de esferos, posponiendo la prueba con equipos informáticos porque no dispone de ellos actualmente. La ruta de detección de equipos está implementada, pero no se afirma precisión validada con monitores, mouses o teclados reales ni con recorridos entre distintas profundidades.

Se verificó en el Samsung el guardado de cuatro esferos: reporte 7, ubicación `Validacion esferos 24-09`, imagen persistida y una única entrada `REPORTE_GUARDADO` con total cuatro. El reporte aparece en el historial y la confirmación muestra `Reporte guardado` y `Listo`. La animación de Guardar y el botón Listo conservan la implementación revisada.

Integración local mediante avance directo de main, conservando su historial y las funciones recuperadas en `876df56`. Respaldo previo: `codex/main-before-counting-20260924`, apuntando a `5150321`. Sin publicación remota. Las notas posteriores conservan el historial de fallos y sus correcciones; sus pendientes históricos no sustituyen este estado de cierre.

## Puntos de recuperación

- `main` de partida: `5150321`.
- Trabajo de conteo e interfaz antes de integrar: `ab1e354`.
- Integración revisada en `feature/arcore-native-counting`: `876df56`.

## Resoluciones

- Se conserva la interfaz y el mapa de superficie de esta rama.
- Se recuperan de main la configuración persistente de IP, la prueba `/health`, Docker, EAS y permisos de red local.
- Todos los servicios utilizan la configuración de conexión. Cada sesión de conteo conserva su servidor hasta finalizar; cambiar la configuración no cambia el destino de esa sesión.
- Se conserva la IP de desarrollo existente como valor inicial cuando no hay configuración guardada ni variable de entorno.
- Se conserva el conteo desde fotografía con revisión, edición de detecciones y reportes de main. Sus cambios son de presentación y manejo de errores de guardado.
- Se conserva `outputOrientation="preview"` y el cálculo de cajas a partir de las dimensiones de la captura y la vista.
- No se reintroducen Viro ni su exportador ONNX; el módulo nativo experimental actual permanece oculto.
- Se mantiene el esquema de reportes compatible; el tipo adicional de AR no elimina los modos anteriores.
- Se unifican los requisitos Python sin entradas duplicadas. Docker instala PyTorch CPU explícitamente antes del resto de requisitos.
- Guardar tiene un pulso de escala 1 → 0,97 → 1 durante 200 ms. Listo no tiene animación propia. Se respeta reducir movimiento.

## Verificación

TypeScript sin errores y seis pruebas de superficie aprobadas. Gradle completó `app:installDebug` e instaló la APK integrada en el Samsung SM-A266M. El backend actualizado respondió `{"status":"ok"}` en `/health`. La validación física del conteo y la rotación de esta versión integrada sigue pendiente; no debe confundirse con la prueba física previa a esta integración.

No se han incluido capturas privadas de depuración ni las eliminaciones previas de imágenes de sprints en los commits. Main no se actualiza hasta completar la validación de la integración.

### Comprobación en Samsung, 22 de septiembre

- La APK instalada cargó el bundle integrado sin errores de AsyncStorage.
- «Probar conexión» confirmó comunicación desde el teléfono con `192.168.1.5:8000`; el backend registró `/health` con estado 200.
- La referencia seleccionada identificó `ballpoint pen`. La sesión física `9717fdb2-7985-4c12-b2ee-dbd45364f261` pasó de cero a tres objetos confirmados en la segunda imagen y mantuvo tres durante la observación estática. Se verificaron visualmente las tres cajas e identificadores.
- La prueba física de giro y recorrido detectó duplicados (3 → 5). Una primera corrección de solapamiento de huellas superó siete pruebas sintéticas, pero la segunda prueba física todavía produjo duplicados. La integración en main permanece pendiente mientras se registra y reproduce el caso real; no considerar aprobada la validación del barrido.
- Metro excluye del rastreo el entorno Python y las carpetas de exportación de modelos locales; conserva los recursos `.tflite` de la app.

### Pausa solicitada por el usuario

Trabajo pausado tras el último recorrido físico. Se conservaron localmente 64 fotogramas y sus detecciones/transformaciones en `analysis/scan-replay/1997115002320` (material privado no versionado). El total pasa de 3 a 4 en la secuencia 51 y termina en 4. La reproducción local está preparada en `analysis/replay_scan.py`. Backend y Metro detenidos; app de diagnóstico cerrada. Main continúa en `5150321`.

Pendiente: reproducir ese recorrido, corregir asociación/mapa sin fusionar objetos vecinos, evitar cajas antiguas durante respuestas lentas (se observó una inferencia YOLO de 37 s al salir los objetos), repetir validación y comprobar guardado. No integrar todavía. Las siete pruebas sintéticas y TypeScript pasan, pero no sustituyen el caso físico que sigue fallando. Los cambios actuales permanecen sin commit en la rama de trabajo.

### Reanudación y corrección, 24 de septiembre

- Reproducido el salto a cuatro en la secuencia 51. En la 50, la caja proyectada se estrecha hasta aproximadamente el 29 % del área original, con un 97 % de su área todavía contenido en la ubicación ya contada. La comparación IoU anterior la rechazaba y creaba un candidato nuevo.
- La asociación admite ahora contención fuerte con tamaños comparables y prioriza identidades confirmadas frente a candidatos provisionales. Se mantienen la comparación por distancia y el solapamiento entre polígonos proyectados.
- Doce pruebas automáticas aprobadas, incluyendo giro, cambio de caja por perspectiva, objetos vecinos, descarte de manchas pequeñas/tonos vecinos y vocabulario de equipos informáticos.
- Los 64 fotogramas reales terminan en tres sin duplicados. La reproducción con todas las imágenes giradas 90° también termina en tres. Una comprobación adicional por HTTP, repitiendo detección y seguimiento de las 64 imágenes, conserva tres durante todo el recorrido tras la confirmación inicial.
- Una sesión que ha reconocido por apariencia conserva esa ruta al recibir una imagen vacía; no activa YOLO por salir los objetos de cámara. Prueba HTTP de entrada/vacío/regreso aprobada (el vacío tardó 0,25 s y conservó el total).
- Las cajas permanecen hasta 3 segundos desde la respuesta, con un límite de 5 segundos desde la captura. El límite inicial de 1,5 segundos impedía mostrarlas cuando la captura/procesamiento tardaba más; se amplió y se priorizó velocidad de captura. El inventario se mantiene aunque caduquen las cajas.
- TypeScript sin errores. Su configuración y la de Metro excluyen las carpetas locales de Python/modelos del rastreo.
- Pendientes de esta revisión: validación física en vivo, guardado y actualización final de main.

### Equipos informáticos

- Mouses/ratones, teclados, portátiles y monitores/pantallas usan las clases específicas del modelo COCO ya instalado. Sus plurales y etiquetas de referencia resuelven a la misma categoría. No se aplica segmentación por color ni similitud de color del ejemplar a estas categorías durante el recorrido.
- La clase COCO `tv` incluye pantallas: no distingue exclusivamente monitores de televisores. Las categorías restantes conservan la ruta anterior.
- El conteo de fotografía restablece `classes=None` explícitamente para que una petición anterior de equipos no deje filtradas las demás categorías.
- Comprobación HTTP con una escena de esferos: las cuatro categorías de equipos devuelven cero detecciones por la ruta específica. Esto comprueba aislamiento de categorías, no precisión sobre equipos reales.
- La memoria espacial sigue siendo un mapa de superficie, con objetos inmóviles y suficientes detalles visibles. No se ha validado como inventario 3D de una habitación con equipos a diferentes profundidades.

### Comprobación adicional en vivo, 24 de septiembre

- Se restauraron los recuadros visibles. Una nueva sesión llegó a seis y posteriormente siete con cuatro esferos: el filtro de apariencia aceptaba zonas cian del estampado dentro de la tolerancia del azul de referencia.
- Cada candidato exige ahora soporte del tono central del ejemplar, además de la máscara tolerante que conserva sombras/bordes. La nueva prueba sintética rechaza una mancha de tono vecino de igual forma/tamaño.
- La redetección de los primeros 55 fotogramas de esa escena conserva cuatro. Se repitió además el recorrido original completo por HTTP: 64 fotogramas, total tres tras la confirmación inicial, sin incremento al regresar.
- Con el backend reiniciado, se comprobó visualmente `4 contados` y recuadros en el Samsung. Se solicitó un recorrido físico adicional; permanece pendiente, junto con equipos informáticos reales. No se ha actualizado main.
- El usuario inició el recorrido adicional: los primeros 59 fotogramas guardados mantienen cuatro tras confirmar, incluidos giro y pérdida/recuperación de registro. Al detenerse, las cajas vuelven a alinearse y se recuperan los identificadores 1–4. No hay un fotograma completamente vacío en ese tramo: no presentarlo como prueba de salida total de cámara. Pendientes confirmación de finalización, equipos reales y guardado.
