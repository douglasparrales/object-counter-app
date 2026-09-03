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
import com.google.ar.core.ArCoreApk

class NativeArCoreModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private var resultadoPendiente: Promise? = null
  private val listener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != SOLICITUD_CONTEO_AR) return
      val promesa = resultadoPendiente ?: return
      resultadoPendiente = null
      promesa.resolve(WritableNativeMap().apply {
        putBoolean("completado", resultCode == Activity.RESULT_OK)
        putInt("total", data?.getIntExtra(NativeArCoreActivity.EXTRA_TOTAL, 0) ?: 0)
      })
    }
  }

  init {
    reactContext.addActivityEventListener(listener)
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
      })
    } catch (error: Exception) {
      promise.reject("ARCORE_AVAILABILITY", "No se pudo comprobar ARCore.", error)
    }
  }

  @ReactMethod
  fun abrirPruebaAnclas(nombre: String, promise: Promise) {
    val actividad = reactApplicationContext.currentActivity
    if (actividad == null) {
      promise.reject("ARCORE_ACTIVITY", "No hay una Activity disponible.")
      return
    }
    if (resultadoPendiente != null) {
      promise.reject("ARCORE_BUSY", "Ya existe una sesión AR abierta.")
      return
    }
    resultadoPendiente = promise
    actividad.startActivityForResult(
      Intent(actividad, NativeArCoreActivity::class.java).putExtra(NativeArCoreActivity.EXTRA_NOMBRE, nombre),
      SOLICITUD_CONTEO_AR,
    )
  }

  companion object {
    private const val SOLICITUD_CONTEO_AR = 7314
  }
}
