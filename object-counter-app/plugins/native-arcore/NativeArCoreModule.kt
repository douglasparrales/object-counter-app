package com.gokudouglas.objectcounterapp

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.bridge.UiThreadUtil
import com.google.ar.core.ArCoreApk
import com.facebook.react.modules.core.DeviceEventManagerModule

class NativeArCoreModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private var resultadoPendiente: Promise? = null
  private val listener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != SOLICITUD_CONTEO_AR) return
      val promesa = resultadoPendiente ?: return
      resultadoPendiente = null
      val codigo = data?.getStringExtra(NativeArCoreActivity.EXTRA_ERROR_CODIGO)
      if (codigo != null) {
        promesa.reject(codigo, data?.getStringExtra(NativeArCoreActivity.EXTRA_ERROR_MENSAJE) ?: "No se pudo abrir AR.")
        return
      }
      promesa.resolve(WritableNativeMap().apply {
        putBoolean("completado", resultCode == Activity.RESULT_OK)
        putInt("total", data?.getIntExtra(NativeArCoreActivity.EXTRA_TOTAL, 0) ?: 0)
      })
    }
  }

  init {
    reactContext.addActivityEventListener(listener)
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit

  override fun invalidate() {
    ArDiagnostics.listener = null
    reactApplicationContext.removeActivityEventListener(listener)
    super.invalidate()
  }

  override fun getName(): String = "NativeArCore"

  @ReactMethod
  fun comprobarCompatibilidad(promise: Promise) {
    try {
      val disponibilidad = ArCoreApk.getInstance().checkAvailability(reactApplicationContext)
      promise.resolve(WritableNativeMap().apply {
        putString("estado", disponibilidad.name)
        putBoolean("compatible", disponibilidad.isSupported)
        putBoolean("transitorio", disponibilidad.isTransient)
        putString("versionNativa", NativeArCoreActivity.VERSION_AR)
      })
    } catch (error: Exception) {
      promise.reject("ARCORE_AVAILABILITY", "No se pudo comprobar ARCore.", error)
    }
  }

  @ReactMethod
  fun abrirConteo(
    nombre: String,
    clase: String,
    referenciaId: String?,
    backendUrl: String,
    promise: Promise,
  ) {
    UiThreadUtil.runOnUiThread {
      val actividad = reactApplicationContext.currentActivity
      if (actividad == null || actividad.isFinishing || actividad.isDestroyed) {
        promise.reject("ARCORE_ACTIVITY", "No hay una Activity disponible.")
        return@runOnUiThread
      }
      if (resultadoPendiente != null) {
        promise.reject("ARCORE_BUSY", "Ya existe una sesión AR abierta.")
        return@runOnUiThread
      }
      resultadoPendiente = promise
      ArDiagnostics.listener = { mensaje ->
        reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("ArDiagnostico", mensaje)
      }
      try {
        actividad.startActivityForResult(
          Intent(actividad, NativeArCoreActivity::class.java)
            .putExtra(NativeArCoreActivity.EXTRA_NOMBRE, nombre)
            .putExtra(NativeArCoreActivity.EXTRA_CLASE, clase)
            .putExtra(NativeArCoreActivity.EXTRA_REFERENCIA_ID, referenciaId)
            .putExtra(NativeArCoreActivity.EXTRA_BACKEND_URL, backendUrl),
          SOLICITUD_CONTEO_AR,
        )
      } catch (error: Exception) {
        resultadoPendiente = null
        promise.reject("ARCORE_START", "No se pudo iniciar la sesión AR.", error)
      }
    }
  }

  companion object {
    private const val SOLICITUD_CONTEO_AR = 7314
  }
}
