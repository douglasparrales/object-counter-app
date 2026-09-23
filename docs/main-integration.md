# Integración de main con conteo persistente

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
