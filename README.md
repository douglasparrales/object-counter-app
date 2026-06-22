# 📱 Object Counter App

Aplicación móvil para el conteo masivo de objetos en tiempo real utilizando visión por computadora.

---

## 🚀 Estado del proyecto

### ✅ Sprint 0 — Configuración inicial

- ✔ Proyecto Expo creado
- ✔ Estructura de carpetas definida
- ✔ Configuración de Expo Router
- ✔ Base de datos SQLite configurada (Drizzle ORM)
- ✔ Navegación base funcionando

---

### ✅ Sprint 1 — Cámara + Mock de detección

- ✔ Cámara funcional en dispositivo real
- ✔ Permisos correctamente gestionados
- ✔ Pantalla `/camera` implementada
- ✔ Hook `useDetection` creado (simulación de detección)
- ✔ Botones funcionales:
  - Contar
  - Detener
  - Voltear cámara
- ✔ Overlay con conteo dinámico (datos simulados)

---

## ✅ Sprint 2 — Integración de (YOLOv8 + TFLite)

- ✔ Modelo YOLOv8n exportado a formato **TensorFlow Lite (.tflite)**
- ✔ Modelo integrado dentro del proyecto (`assets/`)
- ✔ Librería `react-native-fast-tflite` instalada
- ✔ Configuración de Metro para soportar `.tflite`
- ✔ Dev Build nativo generado (`expo run:android`)
- ✔ Configuración de Android SDK completada
- ✔ Resolución de errores avanzados:
  - NitroModules
  - rutas largas en Windows
  - autolinking nativo
  - assets no reconocidos
- ✔ Modelo cargado correctamente en dispositivo real

---

## 📸 Evidencia

<p align="center">
  <img src="./object-counter-app/capturas_sprints/sprint2.png" width="250"/>
</p>

---

## 🧠 Nota importante

Actualmente el conteo es simulado (mock):

```ts
const mockClases = ['naranja', 'manzana', 'botella'];