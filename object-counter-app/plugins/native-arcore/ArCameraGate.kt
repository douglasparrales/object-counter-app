package com.gokudouglas.objectcounterapp

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.camera2.CameraManager
import android.os.Handler
import android.os.Looper

/** Espera la disponibilidad del dispositivo físico, no un evento de preview. */
class ArCameraGate(private val context: Context) {
  private val handler = Handler(Looper.getMainLooper())
  private val manager = context.getSystemService(CameraManager::class.java)
  private var listener: CameraManager.AvailabilityCallback? = null
  private var timeout: Runnable? = null

  fun cancelar() {
    listener?.let { manager.unregisterAvailabilityCallback(it) }
    listener = null
    timeout?.let(handler::removeCallbacks)
    timeout = null
  }

  fun esperar(cameraId: String, lista: () -> Unit, fallo: (String, String) -> Unit) {
    cancelar()
    if (context.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      fallo("ARCORE_CAMERA_PERMISSION", "Falta permiso de cámara. Concédelo en Ajustes > Aplicaciones y vuelve a intentar.")
      return
    }
    try {
      val policy = context.getSystemService(DevicePolicyManager::class.java)
      if (policy?.getCameraDisabled(null) == true) {
        fallo("ARCORE_CAMERA_RESTRICTED", "Android bloqueó la cámara por una política del dispositivo. El administrador debe habilitarla; cambiar a video no evita esta restricción.")
        return
      }
      val callback = object : CameraManager.AvailabilityCallback() {
        override fun onCameraAvailable(id: String) {
          if (id != cameraId || listener !== this) return
          cancelar()
          lista()
        }
      }
      listener = callback
      timeout = Runnable {
        cancelar()
        fallo("ARCORE_CAMERA_BUSY", "Android no dejó disponible la cámara tras 6 segundos. Cierra otras apps de cámara y revisa Acceso a la cámara en los ajustes rápidos.")
      }
      handler.postDelayed(timeout!!, 6_000L)
      manager.registerAvailabilityCallback(callback, handler)
    } catch (error: Exception) {
      cancelar()
      fallo("ARCORE_CAMERA_ACCESS", "No se pudo consultar la cámara (${error.javaClass.simpleName}). Revisa el permiso y las restricciones de Android.")
    }
  }
}
