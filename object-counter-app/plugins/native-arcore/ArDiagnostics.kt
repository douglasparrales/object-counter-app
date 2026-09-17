package com.gokudouglas.objectcounterapp

import android.os.SystemClock
import android.util.Log
import org.json.JSONObject

/** Sin imágenes ni URLs: los eventos llegan a logcat y a la consola de Metro. */
object ArDiagnostics {
  @Volatile var listener: ((String) -> Unit)? = null

  fun event(tipo: String, vararg campos: Pair<String, Any?>) {
    val json = JSONObject().put("evento", tipo).put("tiempo_ms", SystemClock.elapsedRealtime())
      .put("version", NativeArCoreActivity.VERSION_AR)
    campos.forEach { (clave, valor) -> json.put(clave, valor ?: JSONObject.NULL) }
    val mensaje = json.toString()
    Log.i("NativeArCore", mensaje)
    // Un consumidor de diagnóstico nunca debe detener el renderer.
    runCatching { listener?.invoke(mensaje) }
  }
}
