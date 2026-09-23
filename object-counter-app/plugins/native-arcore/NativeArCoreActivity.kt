package com.gokudouglas.objectcounterapp

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Matrix
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.content.Context
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.ImageView
import com.google.ar.core.Anchor
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Config
import com.google.ar.core.Coordinates2d
import com.google.ar.core.DepthPoint
import com.google.ar.core.Frame
import com.google.ar.core.HitResult
import com.google.ar.core.Plane
import com.google.ar.core.Pose
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import com.google.ar.core.TrackingFailureReason
import com.google.ar.core.exceptions.NotYetAvailableException
import com.google.ar.core.exceptions.NotTrackingException
import com.google.ar.core.exceptions.CameraNotAvailableException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

class NativeArCoreActivity : Activity() {
  private lateinit var superficie: GLSurfaceView
  private lateinit var estado: TextView
  private lateinit var total: TextView
  private lateinit var diagnostico: TextView
  private lateinit var ultimaImagen: ImageView
  private lateinit var etiquetas: ArLabelsView
  private lateinit var renderer: ArRenderer
  private var session: Session? = null
  private var instalacionSolicitada = false
  private lateinit var cameraGate: ArCameraGate
  private lateinit var reintentar: Button
  private val handler = Handler(Looper.getMainLooper())
  private var actividadReanudada = false
  @Volatile private var sesionReanudada = false
  private var iniciando = false
  private var intentosCamara = 0
  private var errorCodigo: String? = null
  private var errorMensaje: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    cameraGate = ArCameraGate(this)
    window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    window.statusBarColor = Color.TRANSPARENT
    window.navigationBarColor = Color.BLACK

    val raiz = FrameLayout(this)
    raiz.setOnApplyWindowInsetsListener { view, insets ->
      view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop,
        insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
      insets
    }
    superficie = GLSurfaceView(this).apply {
      setEGLContextClientVersion(2)
      preserveEGLContextOnPause = true
    }
    renderer = ArRenderer(
      session = { if (sesionReanudada) session else null },
      rotation = { windowManager.defaultDisplay.rotation },
      imageRotation = { rotacionImagenCamara() },
      backendUrl = intent.getStringExtra(EXTRA_BACKEND_URL).orEmpty(),
      clase = intent.getStringExtra(EXTRA_CLASE).orEmpty(),
      referenciaId = intent.getStringExtra(EXTRA_REFERENCIA_ID),
      onEstado = { mensaje, cantidad ->
        runOnUiThread {
          if (!isFinishing && errorCodigo == null) {
            estado.text = mensaje
            total.text = cantidad.toString()
          }
        }
      },
      onError = { codigo, mensaje -> runOnUiThread { mostrarError(codigo, mensaje) } },
      onDiagnostico = { mensaje -> runOnUiThread { if (!isFinishing) diagnostico.text = mensaje } },
      onImagen = { bitmap -> runOnUiThread {
        if (!isFinishing && !isDestroyed) ultimaImagen.setImageBitmap(bitmap)
      } },
      onMarcas = { marcas -> runOnUiThread {
        if (!isFinishing) etiquetas.actualizar(marcas)
      } },
      onFin = { advertencia -> runOnUiThread {
        if (!isFinishing) {
          if (advertencia == null) finalizar(true)
          else AlertDialog.Builder(this)
            .setTitle("Revisar conteo")
            .setMessage(advertencia)
            .setPositiveButton("Seguir escaneando") { _, _ -> superficie.queueEvent { renderer.continuarCapturas() } }
            .setNegativeButton("Guardar ${renderer.totalAnclas()} confirmados") { _, _ -> finalizar(true) }
            .setOnCancelListener { superficie.queueEvent { renderer.continuarCapturas() } }
            .show()
        }
      } },
    )
    superficie.setRenderer(renderer)
    superficie.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
    superficie.setOnTouchListener { _, evento ->
      if (evento.action == MotionEvent.ACTION_UP) renderer.registrarToque(evento.x, evento.y)
      true
    }
    raiz.addView(superficie, FrameLayout.LayoutParams(-1, -1))
    etiquetas = ArLabelsView(this)
    raiz.addView(etiquetas, FrameLayout.LayoutParams(-1, -1))

    val hud = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(16), dp(10), dp(16), dp(10))
      setBackgroundColor(Color.argb(215, 0, 0, 0))
    }
    val nombre = intent.getStringExtra(EXTRA_NOMBRE) ?: "Objeto"
    hud.addView(TextView(this).apply {
      text = "$nombre · AR $VERSION_AR"
      textSize = 16f
      setTextColor(Color.LTGRAY)
    })
    total = TextView(this).apply {
      text = "0"
      textSize = 48f
      setTextColor(Color.rgb(74, 222, 128))
    }
    hud.addView(total)
    estado = TextView(this).apply {
      text = "Iniciando ARCore…"
      textSize = 16f
      minLines = 2
      setTextColor(Color.WHITE)
    }
    hud.addView(estado)
    diagnostico = TextView(this).apply {
      text = "Detector: esperando primera imagen"
      textSize = 12f
      minLines = 2
      setTextColor(Color.LTGRAY)
    }
    hud.addView(diagnostico)
    hud.addView(TextView(this).apply {
      text = "Última imagen analizada · cajas blancas = detecciones, no confirmaciones"
      textSize = 11f
      setTextColor(Color.LTGRAY)
    })
    ultimaImagen = ImageView(this).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
    hud.addView(ultimaImagen, LinearLayout.LayoutParams(-1, dp(112)))
    hud.addView(TextView(this).apply {
      text = "Azul: superficie · Amarillo: candidato · Verde: contado"
      textSize = 12f
      setTextColor(Color.LTGRAY)
    })
    reintentar = Button(this).apply {
      text = "Reintentar AR"
      visibility = android.view.View.GONE
      setOnClickListener {
        errorCodigo = null
        errorMensaje = null
        intentosCamara = 0
        visibility = android.view.View.GONE
        iniciarSesion()
      }
    }
    hud.addView(reintentar)
    raiz.addView(hud, FrameLayout.LayoutParams(-1, -2, Gravity.TOP or Gravity.START).apply {
      setMargins(dp(12), dp(8), dp(12), 0)
    })

    val acciones = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    acciones.addView(Button(this).apply {
      text = "Reiniciar"
      setOnClickListener { superficie.queueEvent { renderer.limpiarAnclas() } }
    })
    acciones.addView(Button(this).apply {
      text = "Volver a 2D"
      setOnClickListener { finalizar(false) }
    })
    acciones.addView(Button(this).apply {
      text = "Finalizar"
      setOnClickListener {
        if (errorCodigo != null) finalizar(true)
        else superficie.queueEvent { renderer.terminarCapturas() }
      }
    })
    for (i in 0 until acciones.childCount) {
      (acciones.getChildAt(i) as Button).apply {
        layoutParams = LinearLayout.LayoutParams(0, -2, 1f)
        textSize = 12f
        isAllCaps = false
      }
    }
    raiz.addView(acciones, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM).apply {
      setMargins(dp(12), 0, dp(12), dp(8))
    })
    setContentView(raiz)
    raiz.requestApplyInsets()
  }

  private fun dp(valor: Int): Int = (valor * resources.displayMetrics.density).toInt()

  override fun onResume() {
    super.onResume()
    actividadReanudada = true
    intentosCamara = 0
    iniciarSesion()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus && actividadReanudada) iniciarSesion()
  }

  private fun iniciarSesion() {
    if (!actividadReanudada || !hasWindowFocus() || isFinishing || iniciando || sesionReanudada || errorCodigo != null) return
    iniciando = true
    if (checkSelfPermission(android.Manifest.permission.CAMERA) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
      mostrarError("ARCORE_CAMERA_PERMISSION", "Falta permiso de cámara. Concédelo en los ajustes de la app y pulsa Reintentar AR.")
      return
    }
    estado.text = "Preparando cámara AR…"
    if (session == null) {
      try {
        when (ArCoreApk.getInstance().requestInstall(this, !instalacionSolicitada)) {
          ArCoreApk.InstallStatus.INSTALL_REQUESTED -> {
            instalacionSolicitada = true
            iniciando = false
            return
          }
          ArCoreApk.InstallStatus.INSTALLED -> Unit
        }
        val nueva = Session(this)
        try {
          // Conservar la cámara recomendada por ARCore para este dispositivo.
          // La resolución máxima del stream CPU no implica mejor seguimiento.
          val config = Config(nueva).apply {
            updateMode = Config.UpdateMode.BLOCKING
            planeFindingMode = Config.PlaneFindingMode.HORIZONTAL
            focusMode = Config.FocusMode.AUTO
            if (nueva.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
              depthMode = Config.DepthMode.AUTOMATIC
            }
          }
          nueva.configure(config)
          ArDiagnostics.event("sesion_configurada", "camara" to nueva.cameraConfig.cameraId,
            "imagen" to nueva.cameraConfig.imageSize.toString(), "fps" to nueva.cameraConfig.fpsRange.toString(),
            "depth" to config.depthMode.name, "modelo" to android.os.Build.MODEL)
          session = nueva
        } catch (error: Exception) {
          nueva.close()
          throw error
        }
      } catch (error: Exception) {
        mostrarError("ARCORE_INIT", "No se pudo preparar ARCore (${error.javaClass.simpleName}): ${error.message}")
        return
      }
    }
    val activa = session ?: return
    cameraGate.esperar(activa.cameraConfig.cameraId, lista = {
      if (!actividadReanudada || isFinishing) {
        iniciando = false
        return@esperar
      }
      try {
        activa.resume()
        sesionReanudada = true
        iniciando = false
        superficie.queueEvent { renderer.reanudar() }
        superficie.onResume()
        Log.i("NativeArCore", "Sesión reanudada con cámara ${activa.cameraConfig.cameraId}")
      } catch (error: CameraNotAvailableException) {
        iniciando = false
        intentosCamara += 1
        Log.w("NativeArCore", "Cámara no disponible, intento $intentosCamara", error)
        if (intentosCamara < 3) handler.postDelayed({ iniciarSesion() }, 400L)
        else mostrarError("ARCORE_CAMERA_UNAVAILABLE", "ARCore no puede abrir la cámara. Revisa Acceso a la cámara, permisos y otras apps abiertas; luego pulsa Reintentar AR.")
      } catch (error: Exception) {
        mostrarError("ARCORE_RESUME", "ARCore no pudo reanudarse (${error.javaClass.simpleName}): ${error.message}")
      }
    }, fallo = { codigo, mensaje -> mostrarError(codigo, mensaje) })
  }

  private fun pausarSesion() {
    cameraGate.cancelar()
    handler.removeCallbacksAndMessages(null)
    iniciando = false
    superficie.onPause()
    if (sesionReanudada) {
      sesionReanudada = false
      renderer.pausar()
      try { session?.pause() } catch (error: Exception) {
        Log.w("NativeArCore", "No se pudo pausar la sesión", error)
      }
    }
  }

  private fun mostrarError(codigo: String, mensaje: String) {
    if (isFinishing || isDestroyed || errorCodigo != null) return
    errorCodigo = codigo
    errorMensaje = mensaje
    pausarSesion()
    Log.e("NativeArCore", "$codigo: $mensaje")
    estado.text = mensaje
    reintentar.visibility = android.view.View.VISIBLE
  }

  override fun onPause() {
    actividadReanudada = false
    pausarSesion()
    super.onPause()
  }

  override fun onDestroy() {
    cameraGate.cancelar()
    handler.removeCallbacksAndMessages(null)
    renderer.cerrar()
    session?.close()
    session = null
    super.onDestroy()
  }

  private fun rotacionImagenCamara(): Int {
    val activa = session ?: return 0
    val sensor = getSystemService(CameraManager::class.java)
      .getCameraCharacteristics(activa.cameraConfig.cameraId)
      .get(CameraCharacteristics.SENSOR_ORIENTATION) ?: return 0
    val pantalla = when (windowManager.defaultDisplay.rotation) {
      android.view.Surface.ROTATION_90 -> 90
      android.view.Surface.ROTATION_180 -> 180
      android.view.Surface.ROTATION_270 -> 270
      else -> 0
    }
    return (sensor - pantalla + 360) % 360
  }

  @Deprecated("Deprecated in Android")
  override fun onBackPressed() = finalizar(false)

  private fun finalizar(completado: Boolean) {
    if (isFinishing) return
    pausarSesion()
    val cantidad = renderer.totalAnclas()
    ArDiagnostics.event("sesion_finalizada", "completado" to completado, "total" to cantidad,
      "error" to errorCodigo)
    setResult(
      if (completado) RESULT_OK else RESULT_CANCELED,
      Intent().putExtra(EXTRA_TOTAL, cantidad)
        .putExtra(EXTRA_ERROR_CODIGO, if (completado) null else errorCodigo)
        .putExtra(EXTRA_ERROR_MENSAJE, if (completado) null else errorMensaje),
    )
    finish()
  }

  companion object {
    const val VERSION_AR = "2026.09.22.2"
    const val EXTRA_NOMBRE = "nombre"
    const val EXTRA_CLASE = "clase"
    const val EXTRA_REFERENCIA_ID = "referencia_id"
    const val EXTRA_BACKEND_URL = "backend_url"
    const val EXTRA_TOTAL = "total"
    const val EXTRA_ERROR_CODIGO = "error_codigo"
    const val EXTRA_ERROR_MENSAJE = "error_mensaje"
  }
}

private class ArRenderer(
  private val session: () -> Session?,
  private val rotation: () -> Int,
  private val imageRotation: () -> Int,
  private val backendUrl: String,
  private val clase: String,
  private val referenciaId: String?,
  private val onEstado: (String, Int) -> Unit,
  private val onError: (String, String) -> Unit,
  private val onDiagnostico: (String) -> Unit,
  private val onImagen: (Bitmap) -> Unit,
  private val onMarcas: (List<ArLabel>) -> Unit,
  private val onFin: (String?) -> Unit,
) : GLSurfaceView.Renderer {
  private val toques = ConcurrentLinkedQueue<Pair<Float, Float>>()
  private val mapa = ArSpatialMap()
  private val anclas = mutableListOf<ArSpatialMap.Marca>()
  private val candidatosPendientes = mutableListOf<CandidatoEspacial>()
  private val ejecutorDeteccion = Executors.newSingleThreadExecutor()
  private val inferenciaActiva = AtomicBoolean(false)
  private val resultados = ConcurrentLinkedQueue<ResultadoDeteccion>()
  private val capturasPendientes = java.util.ArrayDeque<CapturaPendiente>()
  private var texturaCamara = 0
  private var texturaPendiente = true
  private var programaCamara = 0
  private var programaPuntos = 0
  private var ancho = 1
  private var alto = 1
  private var geometriaPendiente = true
  private var ultimoEstado = ""
  private var ultimoTracking = TrackingState.PAUSED
  @Volatile private var framesEstables = 0
  private var ultimaSolicitud = 0L
  private var inicioEspera = 0L
  private var trackingPausadoDesde = 0L
  private var ultimoTimestamp = 0L
  private var ultimaRotacion = -1
  private var avisoHasta = 0L
  private var aviso = ""
  private var ultimoError = ""
  private val generacion = java.util.concurrent.atomic.AtomicLong(0)
  @Volatile private var cerrado = false
  private var errorNotificado = false
  private var proximamente = 0L
  private var diagnosticoDetector = "Detector: esperando primera imagen"
  private var ultimoDiagnostico = ""
  private var capturasOmitidas = 0
  private var finalizando = false
  private var finNotificado = false
  private var falloDetector = false
  private var estadoMostrado = ""
  private var mostradoDesde = 0L
  private var diagnosticoDesde = 0L
  private var ultimaTelemetria = 0L
  private var motivoTracking = "NONE"
  private var planosDisponibles = 0
  private var sinUbicar = 0
  private var inicioSinPlano = 0L
  private var ultimaProfundidad = false
  private var ultimasEtiquetas = 0L
  private val vertices = buffer(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f))
  private val uv = buffer(FloatArray(8))

  fun registrarToque(x: Float, y: Float) {
    if (framesEstables < FRAMES_PARA_ANCLAR || cerrado) return
    toques.add(x to y)
  }

  fun limpiarAnclas() {
    onMarcas(emptyList())
    generacion.incrementAndGet()
    vaciarCapturas()
    synchronized(anclas) {
      anclas.clear()
      limpiarCandidatos()
      mapa.limpiar()
      resultados.clear()
      toques.clear()
      inicioEspera = 0L
      avisoHasta = 0L
      capturasOmitidas = 0
      sinUbicar = 0
      ultimaProfundidad = false
      inicioSinPlano = 0L
      falloDetector = false
      proximamente = 0L
      diagnosticoDetector = "Detector: esperando primera imagen"
      finalizando = false
      finNotificado = false
    }
    publicar("Escaneo reiniciado · recorre lentamente todos los objetos")
  }

  fun cerrar() {
    cerrado = true
    limpiarAnclas()
    resultados.clear()
    ejecutorDeteccion.shutdownNow()
  }

  fun totalAnclas(): Int = synchronized(anclas) { anclas.size }

  // pausar se llama sólo una vez detenido el hilo GL.
  fun pausar() {
    framesEstables = 0
    toques.clear()
    // Una interrupción breve no borra evidencia ni el mapa. Los resultados
    // se aplican al recuperar tracking, nunca mientras la cámara esté pausada.
  }

  fun reanudar() {
    framesEstables = 0
    ultimoTimestamp = 0L
    inicioEspera = 0L
    trackingPausadoDesde = 0L
    geometriaPendiente = true
    texturaPendiente = true
    errorNotificado = false
  }

  private fun limpiarCandidatos() {
    candidatosPendientes.clear()
  }

  private fun vaciarCapturas() {
    while (capturasPendientes.isNotEmpty()) capturasPendientes.removeFirst().geometria.liberar()
    while (true) (resultados.poll() ?: break).geometria.liberar()
  }

  private fun descartarCapturasVencidas(ahora: Long) {
    // Se ejecuta también durante las pausas. Un return del seguimiento no debe
    // retener imágenes/anclas para siempre ni ocultar respuestas del detector.
    var pendientes = resultados.size
    while (pendientes-- > 0) {
      val resultado = resultados.poll() ?: break
      val invalida = resultado.generacion != generacion.get()
      val limite = if (resultado.reintentarEn > 0L) 8000L else 30_000L
      if (invalida || ahora - resultado.capturadoEn > limite) {
        resultado.geometria.liberar()
        if (!invalida) {
          sinUbicar += resultado.detecciones.size
          capturasOmitidas += 1
          ArDiagnostics.event("captura_descartada", "frame" to resultado.loteId,
            "motivo" to "GEOMETRIA_CADUCADA", "visibles" to resultado.detecciones.size)
          avisar("Una imagen perdió su posición · repasa esa zona; el total confirmado se conserva")
        }
      } else resultados.add(resultado)
    }
    while (capturasPendientes.isNotEmpty() && ahora - capturasPendientes.peekFirst().capturadoEn > 8000L) {
      capturasPendientes.removeFirst().geometria.liberar()
      capturasOmitidas += 1
    }
  }

  fun terminarCapturas() {
    finalizando = true
    avisar("Terminando análisis · conserva la cámara orientada a la superficie")
  }

  fun continuarCapturas() {
    finalizando = false
    finNotificado = false
  }

  private fun comprobarFin() {
    if (!finalizando || finNotificado || inferenciaActiva.get() || capturasPendientes.isNotEmpty() || resultados.isNotEmpty()) return
    finNotificado = true
    val problemas = mutableListOf<String>()
    if (candidatosPendientes.isNotEmpty()) problemas.add("${candidatosPendientes.size} candidatos necesitan otra observación.")
    if (capturasOmitidas > 0) problemas.add("El análisis no pudo cubrir partes del recorrido; repasa esas zonas más despacio.")
    if (falloDetector) problemas.add("El detector falló durante el recorrido. El total podría estar incompleto.")
    if (sinUbicar > 0) problemas.add("Hubo detecciones sin posición 3D. El total no representa todos los objetos visibles; vuelve a recorrer la zona cuando aparezca la superficie azul.")
    if (totalAnclas() == 0) problemas.add("No se confirmó ningún objeto. Un cero aquí no significa que la superficie esté vacía.")
    onFin(problemas.takeIf { it.isNotEmpty() }?.joinToString("\n"))
  }

  override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
    GLES20.glClearColor(0f, 0f, 0f, 1f)
    try {
      texturaCamara = crearTexturaExterna()
      texturaPendiente = true
      programaCamara = programa(VERTEX_CAMARA, FRAGMENT_CAMARA)
      programaPuntos = programa(VERTEX_PUNTOS, FRAGMENT_PUNTOS)
    } catch (error: Exception) {
      Log.e(TAG, "No se pudo crear la vista OpenGL", error)
      errorNotificado = true
      onError("ARCORE_GRAPHICS", "No se pudo preparar la vista gráfica AR. Vuelve al selector y abre AR nuevamente.")
    }
  }

  override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
    ancho = width
    alto = height
    geometriaPendiente = true
    GLES20.glViewport(0, 0, width, height)
  }

  override fun onDrawFrame(gl: GL10?) {
    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
    val activa = session() ?: return
    if (errorNotificado || cerrado) return
    try {
      if (texturaPendiente) {
        activa.setCameraTextureName(texturaCamara)
        texturaPendiente = false
      }
      val rotacionActual = rotation()
      if (geometriaPendiente || ultimaRotacion != rotacionActual) {
        activa.setDisplayGeometry(rotacionActual, ancho, alto)
        ultimaRotacion = rotacionActual
        geometriaPendiente = false
      }
      val frame = activa.update()
      val ahora = SystemClock.elapsedRealtime()
      descartarCapturasVencidas(ahora)
      if (inicioEspera == 0L) inicioEspera = ahora
      if (frame.timestamp != 0L) dibujarCamara(frame)
      val seguimiento = frame.camera.trackingState
      motivoTracking = frame.camera.trackingFailureReason.name
      if (ultimoTracking != seguimiento) {
        onMarcas(emptyList())
        ultimoTracking = seguimiento
      }
      planosDisponibles = activa.getAllTrackables(Plane::class.java).count {
        it.trackingState == TrackingState.TRACKING && it.subsumedBy == null &&
          it.type == Plane.Type.HORIZONTAL_UPWARD_FACING
      }
      if (ahora - ultimaTelemetria >= 2000L) {
        ultimaTelemetria = ahora
        ArDiagnostics.event("seguimiento", "estado" to seguimiento.name,
          "motivo" to motivoTracking, "planos" to planosDisponibles,
          "frames_estables" to framesEstables, "resultados_pendientes" to resultados.size,
          "confirmados_sin_tracking" to synchronized(anclas) { anclas.count { it.trackingState != TrackingState.TRACKING } },
          "total" to totalAnclas())
      }
      if (seguimiento != TrackingState.TRACKING) {
        if (trackingPausadoDesde == 0L) trackingPausadoDesde = ahora
        framesEstables = 0
        toques.clear()
        if (ahora - trackingPausadoDesde >= 30_000L) {
          errorNotificado = true
          onError("ARCORE_TRACKING_TIMEOUT", "AR no logró recuperar el seguimiento en 30 segundos. Mejora la luz, incluye una superficie con detalles y pulsa Reintentar AR. El total confirmado se conserva.")
          return
        }
        val ayuda = when (frame.camera.trackingFailureReason) {
          TrackingFailureReason.INSUFFICIENT_LIGHT -> "Falta luz · ilumina la mesa sin reflejos y descubre la cámara"
          TrackingFailureReason.INSUFFICIENT_FEATURES -> "Faltan detalles · incluye el borde de la mesa o papel con dibujos"
          TrackingFailureReason.EXCESSIVE_MOTION -> "Movimiento excesivo · mueve el teléfono más despacio"
          TrackingFailureReason.CAMERA_UNAVAILABLE -> "Cámara ocupada · vuelve a 2D y cierra otras apps de cámara"
          TrackingFailureReason.BAD_STATE -> "No se pudo recuperar AR · vuelve a 2D e intenta abrir AR otra vez"
          else -> "Iniciando seguimiento · apunta a la mesa a 30–60 cm y desplázate suavemente"
        }
        publicar(ayuda + if (ahora - trackingPausadoDesde >= 15_000L)
          "\nAR no logra ubicarse. Puedes volver a 2D y contar sin calibración." else "")
        if (finalizando && !finNotificado) {
          finNotificado = true
          onFin("El seguimiento está en pausa ($motivoTracking). Hay imágenes sin ubicar; ${totalAnclas()} es sólo el total confirmado. Vuelve a la superficie para continuar.")
        }
        return
      }
      trackingPausadoDesde = 0L
      if (frame.timestamp == ultimoTimestamp) {
        dibujarAnclas(frame)
        return
      }
      ultimoTimestamp = frame.timestamp
      framesEstables = (framesEstables + 1).coerceAtMost(FRAMES_PARA_ANCLAR)
      if (synchronized(anclas) { anclas.any { it.trackingState != TrackingState.TRACKING } }) {
        pausar()
        dibujarAnclas(frame)
        val perdido = synchronized(anclas) { anclas.any { it.trackingState == TrackingState.STOPPED } }
        publicar(if (perdido) "Se perdió el mapa anterior. Finaliza para guardar el total o pulsa Reiniciar para contar desde cero."
          else "Recuperando posiciones ya contadas · vuelve a la zona anterior. Total conservado; nuevas detecciones en pausa.")
        if (finalizando && !finNotificado) {
          finNotificado = true
          onFin("El mapa no está disponible para procesar las imágenes pendientes. Puedes volver a la zona anterior para recuperarlo o guardar únicamente los ${totalAnclas()} objetos confirmados.")
        }
        return
      }
      procesarToques(frame)
      procesarDetecciones(frame)
      dibujarAnclas(frame)
      solicitarDeteccion(frame)
      despacharDeteccion()
      comprobarFin()
      val superficieDisponible = planosDisponibles > 0
      if (superficieDisponible) inicioSinPlano = 0L
      else if (inicioSinPlano == 0L) inicioSinPlano = ahora
      publicar(
        if (framesEstables < FRAMES_PARA_ANCLAR)
          "Estabilizando seguimiento · mueve la cámara lentamente"
        else if (finalizando) "Terminando análisis · conserva la cámara orientada a la superficie"
        else if (!superficieDisponible && !ultimaProfundidad && ahora - inicioSinPlano >= 15_000L)
          "Sin plano horizontal · incluye bordes o papel con dibujos, evita reflejos. Puedes volver a 2D."
        else if (ahora < avisoHasta) aviso
        else if (!superficieDisponible && !ultimaProfundidad)
          "Primero ubica la mesa · aléjate para incluir sus bordes y espera el contorno azul"
        else "Escaneo activo · recorre los objetos con movimiento lento y continuo"
      )
    } catch (error: Exception) {
      val detalle = "${error.javaClass.simpleName}: ${error.message}"
      if (detalle != ultimoError) Log.e(TAG, "Error durante el frame AR: $detalle", error)
      ultimoError = detalle
      framesEstables = 0
      errorNotificado = true
      onError(
        if (error is CameraNotAvailableException) "ARCORE_CAMERA_UNAVAILABLE" else "ARCORE_FRAME",
        if (error is CameraNotAvailableException)
          "Android retiró la cámara a ARCore. Cierra otras apps de cámara, revisa el acceso a cámara y pulsa Reintentar AR."
        else "AR no pudo procesar la escena (${error.javaClass.simpleName}). Puedes reintentar AR o finalizar con el conteo conservado.",
      )
    }
  }

  private fun solicitarDeteccion(frame: Frame) {
    if (finalizando || framesEstables < FRAMES_PARA_ANCLAR) return
    if (backendUrl.isBlank() || clase.isBlank()) {
      diagnosticoDetector = "Falta configurar el detector o la referencia"
      falloDetector = true
      return
    }
    val activa = session() ?: return
    val ahora = SystemClock.elapsedRealtime()
    if (ahora < proximamente || ahora - ultimaSolicitud < INTERVALO_DETECCION_MS) return
    if (capturasPendientes.size >= 6) {
      if (ahora - ultimaSolicitud >= 1000L) {
        val anterior = capturasPendientes.peekLast()?.geometria?.poseCamaraActual()
        if (anterior == null || !camaraSuficientementeEstable(anterior, frame.camera.pose)) capturasOmitidas += 1
        ultimaSolicitud = ahora
        avisar("El análisis va detrás de la cámara · avanza más despacio y repasa la última zona")
      }
      return
    }
    try {
      val rotacionCaptura = try { imageRotation() } catch (_: Exception) { 0 }
      // Cerrar Image antes de abandonar el frame: pause/close nunca compiten
      // con una imagen nativa retenida por la petición de red.
      val image = frame.acquireCameraImage().use {
        if (it.timestamp != frame.timestamp) return
        ArDetectionClient.copiarImagen(it)
      }
      val geometria = ArCaptureGeometry(frame, activa, mapa)
      ultimaProfundidad = geometria.tieneProfundidad
      diagnosticoDetector = "Imagen capturada · esperando análisis"
      ultimaSolicitud = ahora
      capturasPendientes.addLast(CapturaPendiente(image, rotacionCaptura, geometria, generacion.get(), ahora))
    } catch (_: NotYetAvailableException) {
      // ARCore puede no entregar imagen CPU en algunos frames.
    } catch (_: NotTrackingException) {
      // Transición transitoria entre la consulta de cámara y createAnchor.
      // Reintentar pronto: el backoff de red de 2 s perdía todas las ventanas útiles.
      ultimaProfundidad = false
      proximamente = ahora + 150L
      ArDiagnostics.event("captura_reintentada", "motivo" to "NOT_TRACKING")
    } catch (error: Exception) {
      proximamente = ahora + 2000L
      diagnosticoDetector = "Captura no disponible: ${error.javaClass.simpleName}"
      avisar("No se pudo capturar una imagen para contar · se reintentará")
      Log.w(TAG, "No se pudo adquirir la imagen de ARCore", error)
    }
  }

  private fun despacharDeteccion() {
    if (capturasPendientes.isEmpty() || !inferenciaActiva.compareAndSet(false, true)) return
    val captura = capturasPendientes.removeFirst()
    try {
      ejecutorDeteccion.execute {
        val inicio = SystemClock.elapsedRealtime()
        var error: String? = null
        val detecciones = try {
          val jpeg = ArDetectionClient.imageToJpeg(captura.imagen)
          val objetos = ArDetectionClient.detectar(backendUrl, clase, referenciaId, captura.rotacion,
            jpeg, captura.capturadoEn)
          if (!cerrado && generacion.get() == captura.generacion) {
            // El preview pertenece a la captura, nunca a la cámara actual.
            runCatching { onImagen(imagenAnotada(jpeg, objetos, captura.rotacion)) }
          }
          objetos
        } catch (fallo: Exception) {
          error = fallo.message ?: fallo.javaClass.simpleName
          Log.w(TAG, "No se pudo analizar la captura", fallo)
          ArDiagnostics.event("detector_error", "frame" to captura.capturadoEn, "detalle" to error)
          emptyList()
        }
        // Incluso generaciones antiguas vuelven al hilo GL para liberar su ancla.
        if (!cerrado) {
          resultados.add(ResultadoDeteccion(detecciones, captura.imagen.width, captura.imagen.height,
            error, captura.generacion, captura.geometria, captura.capturadoEn,
            SystemClock.elapsedRealtime() - inicio))
        }
        inferenciaActiva.set(false)
      }
    } catch (error: Exception) {
      captura.geometria.liberar()
      inferenciaActiva.set(false)
      throw error
    }
  }

  private fun procesarDetecciones(frame: Frame) {
    // Un resultado sin plano conserva su geometría y se reintenta. Cada lote
    // se procesa como máximo una vez por frame, nunca en un bucle de reencolado.
    var pendientes = resultados.size
    while (pendientes-- > 0) {
      val resultado = resultados.poll() ?: break
      if (resultado.generacion != generacion.get()) {
        resultado.geometria.liberar()
        continue
      }
      val ahora = SystemClock.elapsedRealtime()
      if (ahora < resultado.reintentarEn) {
        resultados.add(resultado)
        continue
      }
      var retenida = false
      try {
        if (resultado.error != null) {
          falloDetector = true
          diagnosticoDetector = "Detector sin respuesta: ${resultado.error}"
          proximamente = SystemClock.elapsedRealtime() + 3000L
          vaciarCapturas()
          avisar("No se pudo analizar la imagen · ${resultado.error}")
          continue
        }
        diagnosticoDetector = "Detector: ${resultado.detecciones.size} visibles · ${resultado.duracionMs} ms"
        resultado.geometria.completarSuperficies(requireNotNull(session()))
        val usadas = mutableSetOf<ArSpatialMap.Marca>()
        val noUbicadas = mutableListOf<ArDetection>()
        val rechazos = mutableMapOf<String, Int>()
        var ubicadas = 0
        if (SystemClock.elapsedRealtime() - resultado.capturadoEn > 30_000L) {
          capturasOmitidas += 1
          sinUbicar += resultado.detecciones.size
          avisar("El detector tarda demasiado · repite la zona y revisa la conexión")
          continue
        }
        for (deteccion in resultado.detecciones) {
          // Una caja cortada cambia de centro al entrar en pantalla. Esperar
          // el objeto completo evita fijar un fragmento como otra identidad.
          if (deteccion.cx - deteccion.w / 2 <= 0.01f || deteccion.cy - deteccion.h / 2 <= 0.01f ||
            deteccion.cx + deteccion.w / 2 >= 0.99f || deteccion.cy + deteccion.h / 2 >= 0.99f) {
            rechazos["OBJETO_CORTADO"] = (rechazos["OBJETO_CORTADO"] ?: 0) + 1
            avisar("Objeto cortado por el borde · encuádralo completo para contarlo")
            continue
          }
          val pose = resultado.geometria.resolver(deteccion.cx, deteccion.cy)
          val desdeProfundidad = resultado.geometria.motivo == "PROFUNDIDAD"
          val camaraCaptura = resultado.geometria.poseCamaraActual()
          // Depth/hit-test actual sólo es válido si la cámara sigue en su sitio.
          val impacto = if (pose == null && camaraCaptura != null && camaraSuficientementeEstable(camaraCaptura, frame.camera.pose))
            buscarImpacto(frame, deteccion, resultado.anchoImagen, resultado.altoImagen) else null
          val posicion = pose ?: impacto?.hitPose
          if (posicion == null) {
            noUbicadas.add(deteccion)
            val motivo = resultado.geometria.motivo
            rechazos[motivo] = (rechazos[motivo] ?: 0) + 1
            avisar("Objeto visible, aún sin anclaje · encuadra la mesa y sus bordes para ubicarlo")
            continue
          }
          ubicadas += 1
          val bordeX = resultado.geometria.resolver((deteccion.cx + deteccion.w * 0.25f).coerceAtMost(1f), deteccion.cy)
          val bordeY = resultado.geometria.resolver(deteccion.cx, (deteccion.cy + deteccion.h * 0.25f).coerceAtMost(1f))
          val radio = if (bordeX != null && bordeY != null)
            (kotlin.math.sqrt(minOf(distanciaCuadrada(posicion, bordeX), distanciaCuadrada(posicion, bordeY))) * 1.5f).coerceIn(0.008f, 0.025f)
          else 0.018f
          try { agregarAnclaSiEsNueva(
            posicion,
            "automática ${Math.round(deteccion.confianza * 100)}%",
            resultado.loteId,
            radio = radio,
            profundidad = desdeProfundidad || (impacto?.trackable is DepthPoint),
            camara = camaraCaptura,
            usadas = usadas,
            crearAncla = { impacto?.createAnchor() ?: requireNotNull(session()).createAnchor(posicion) },
          ) } catch (_: NotTrackingException) {
            ubicadas -= 1
            noUbicadas.add(deteccion)
            rechazos["ANCLA_NO_DISPONIBLE"] = (rechazos["ANCLA_NO_DISPONIBLE"] ?: 0) + 1
          }
        }
        diagnosticoDetector += " · $ubicadas ubicados · ${candidatosPendientes.size} por confirmar"
        if (noUbicadas.isNotEmpty()) {
          // Límite de memoria y tiempo. Nunca reutilizar el mismo lote como
          // una segunda observación para confirmar un objeto.
          if (ahora - resultado.capturadoEn < 8000L && resultados.size < 8 && !finalizando) {
            resultados.add(resultado.copy(detecciones = noUbicadas, reintentarEn = ahora + 750L))
            retenida = true
          } else sinUbicar += noUbicadas.size
        }
        ArDiagnostics.event("proyeccion", "frame" to resultado.loteId,
          "visibles" to resultado.detecciones.size, "ubicados" to ubicadas,
          "superficies" to resultado.geometria.numeroSuperficies,
          "profundidad_capturada" to resultado.geometria.tieneProfundidad,
          "rechazos" to org.json.JSONObject(rechazos as Map<*, *>),
          "retenida" to retenida, "edad_ms" to ahora - resultado.capturadoEn,
          "detector_ms" to resultado.duracionMs, "candidatos" to candidatosPendientes.size,
          "total" to totalAnclas())
      } finally {
        if (!retenida) resultado.geometria.liberar()
      }
    }
  }

  private fun buscarImpacto(frame: Frame, deteccion: ArDetection, anchoImagen: Int, altoImagen: Int): HitResult? {
    // Para objetos tumbados (esferos), el centro evita desplazar el marcador
    // al borde de la caja. No se inventa una distancia sin geometría medida.
    val puntos = listOf(
      deteccion.cx to deteccion.cy,
    )
    for ((xNormalizado, yNormalizado) in puntos) {
      val entrada = buffer(floatArrayOf(xNormalizado * anchoImagen, yNormalizado * altoImagen))
      val salida = buffer(FloatArray(2))
      frame.transformCoordinates2d(Coordinates2d.IMAGE_PIXELS, entrada, Coordinates2d.VIEW, salida)
      val impactos = frame.hitTest(salida.get(0), salida.get(1))
      val valido = impactos.firstOrNull { hit ->
        val objetivo = hit.trackable
        (objetivo is Plane && objetivo.type == Plane.Type.HORIZONTAL_UPWARD_FACING && objetivo.trackingState == TrackingState.TRACKING && objetivo.isPoseInPolygon(hit.hitPose)) ||
          (objetivo is DepthPoint && objetivo.trackingState == TrackingState.TRACKING)
      }
      if (valido != null) return valido
    }
    return null
  }

  private fun agregarAnclaSiEsNueva(
    pose: Pose, origen: String, loteId: Long? = null, radio: Float = 0.018f,
    profundidad: Boolean = false, camara: Pose? = null,
    usadas: MutableSet<ArSpatialMap.Marca> = mutableSetOf(), crearAncla: () -> Anchor,
  ) {
    synchronized(anclas) {
      fun coincide(marca: ArSpatialMap.Marca): Boolean {
        val r = maxOf(marca.radioAsociacion, radio)
        if (distanciaCuadrada(marca.pose, pose) < r * r) return true
        if ((!profundidad && !marca.usaProfundidad) || camara == null) return false
        // La profundidad introduce sobre todo error a lo largo del rayo.
        // No aumentar el radio lateral: fusionaría esferos vecinos.
        val a = camara.inverse().compose(marca.pose).translation
        val b = camara.inverse().compose(pose).translation
        if (a[2] >= -0.1f || b[2] >= -0.1f || kotlin.math.abs(a[2] - b[2]) > 0.04f) return false
        val escala = b[2] / a[2]
        val dx = a[0] * escala - b[0]
        val dy = a[1] * escala - b[1]
        return dx * dx + dy * dy < r * r
      }
      val duplicada = anclas.filter { it !in usadas && it.trackingState == TrackingState.TRACKING }
        .filter { coincide(it) }
        .minByOrNull { distanciaCuadrada(it.pose, pose) }
      if (duplicada != null) {
        usadas.add(duplicada)
        candidatosPendientes.removeAll {
          distanciaCuadrada(it.ancla.pose, duplicada.pose) < duplicada.radioAsociacion * duplicada.radioAsociacion
        }
        Log.d(TAG, "Detección $origen asociada a un objeto ya contado")
        ArDiagnostics.event("objeto_reconocido", "frame" to loteId, "total" to anclas.size)
        return
      }
      // Una segunda caja compatible con una identidad ya usada es ambigua.
      // Esperar otra vista en lugar de crear un segundo objeto encima.
      if (usadas.any { coincide(it) }) return
      if (loteId != null) {
        val ahora = SystemClock.elapsedRealtime()
        candidatosPendientes.removeAll {
          val caducado = ahora - it.ultimoVisto > VIGENCIA_CANDIDATO_MS || it.ancla.trackingState == TrackingState.STOPPED
          caducado
        }
        val candidato = candidatosPendientes.filter {
          it.ultimoLote < loteId && it.ancla.trackingState == TrackingState.TRACKING && coincide(it.ancla)
        }.minByOrNull { distanciaCuadrada(it.ancla.pose, pose) }
        if (candidato == null) {
          // Un resultado antiguo reintentado no crea otro candidato encima.
          if (candidatosPendientes.any { coincide(it.ancla) }) return
          candidatosPendientes.add(CandidatoEspacial(mapa.ubicar(pose, crearAncla).also {
            it.radioAsociacion = radio
            it.usaProfundidad = profundidad
          }, 1, ahora, loteId))
          ArDiagnostics.event("candidato_creado", "frame" to loteId, "radio_m" to radio,
            "candidatos" to candidatosPendientes.size)
          avisar("Objeto candidato · mantén el encuadre para confirmar")
          return
        }
        candidato.ultimoVisto = ahora
        if (candidato.ultimoLote != loteId) {
          candidato.vistas += 1
          candidato.ultimoLote = loteId
        }
        if (candidato.vistas < (if (profundidad || candidato.ancla.usaProfundidad) 3 else DETECCIONES_PARA_CONFIRMAR)) return
        candidatosPendientes.remove(candidato)
        anclas.add(candidato.ancla)
        usadas.add(candidato.ancla)
      } else {
        anclas.add(mapa.ubicar(pose, crearAncla).also { it.radioAsociacion = radio })
      }
      Log.d(TAG, "Ancla $origen creada. Total: ${anclas.size}")
      ArDiagnostics.event("objeto_confirmado", "frame" to loteId, "total" to anclas.size)
      avisar("Objeto detectado y fijado en el mapa")
    }
  }

  private fun camaraSuficientementeEstable(inicio: Pose, fin: Pose): Boolean {
    val desplazamiento = Math.sqrt(distanciaCuadrada(inicio, fin).toDouble()).toFloat()
    val qi = FloatArray(4).also { inicio.getRotationQuaternion(it, 0) }
    val qf = FloatArray(4).also { fin.getRotationQuaternion(it, 0) }
    val producto = Math.abs(qi.indices.sumOf { indice -> (qi[indice] * qf[indice]).toDouble() })
      .coerceIn(0.0, 1.0)
    val giroGrados = Math.toDegrees(2.0 * Math.acos(producto))
    return desplazamiento <= MOVIMIENTO_MAXIMO_METROS && giroGrados <= GIRO_MAXIMO_GRADOS
  }

  private fun distanciaCuadrada(a: Pose, b: Pose): Float {
    val dx = a.tx() - b.tx()
    val dy = a.ty() - b.ty()
    val dz = a.tz() - b.tz()
    return dx * dx + dy * dy + dz * dz
  }

  private fun procesarToques(frame: Frame) {
    var toque = toques.poll()
    while (toque != null) {
      val impactos = frame.hitTest(toque.first, toque.second)
      // Plano confirmado primero; Depth API permite marcar superficies que el
      // detector de planos todavía no ha delimitado. No usamos Instant Placement.
      val impacto = impactos.firstOrNull { hit ->
        val objetivo = hit.trackable
        objetivo is Plane && objetivo.trackingState == TrackingState.TRACKING &&
          objetivo.type == Plane.Type.HORIZONTAL_UPWARD_FACING &&
          objetivo.isPoseInPolygon(hit.hitPose)
      } ?: impactos.firstOrNull { hit ->
        hit.trackable is DepthPoint && hit.trackable.trackingState == TrackingState.TRACKING
      }
      if (impacto == null) {
        avisar("Toca la mesa junto a la base del objeto")
      } else agregarAnclaSiEsNueva(impacto.hitPose, "manual", crearAncla = { impacto.createAnchor() })
      toque = toques.poll()
    }
  }

  private fun dibujarCamara(frame: Frame) {
    val ndc = vertices.duplicate().apply { position(0) }
    val textura = uv.duplicate().apply { position(0) }
    frame.transformCoordinates2d(
      Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES,
      ndc,
      Coordinates2d.TEXTURE_NORMALIZED,
      textura,
    )
    GLES20.glDisable(GLES20.GL_DEPTH_TEST)
    GLES20.glUseProgram(programaCamara)
    atributo(programaCamara, "aPos", vertices, 2)
    atributo(programaCamara, "aUv", textura, 2)
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, texturaCamara)
    GLES20.glUniform1i(GLES20.glGetUniformLocation(programaCamara, "uTexture"), 0)
    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
  }

  private fun dibujarAnclas(frame: Frame) {
    val vista = FloatArray(16)
    val proyeccion = FloatArray(16)
    val vp = FloatArray(16)
    frame.camera.getViewMatrix(vista, 0)
    frame.camera.getProjectionMatrix(proyeccion, 0, 0.1f, 100f)
    android.opengl.Matrix.multiplyMM(vp, 0, proyeccion, 0, vista, 0)
    fun proyectar(poses: List<Pose>): FloatArray {
      val puntos = mutableListOf<Float>()
      for (p in poses) {
        val salida = FloatArray(4)
        android.opengl.Matrix.multiplyMV(salida, 0, vp, 0, floatArrayOf(p.tx(), p.ty(), p.tz(), 1f), 0)
        if (salida[3] > 0f) {
          puntos.add(salida[0] / salida[3])
          puntos.add(salida[1] / salida[3])
        }
      }
      return puntos.toFloatArray()
    }
    GLES20.glEnable(GLES20.GL_BLEND)
    GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)
    GLES20.glUseProgram(programaPuntos)
    fun dibujar(puntos: FloatArray, modo: Int, r: Float, g: Float, b: Float) {
      if (puntos.isEmpty()) return
      GLES20.glUniform4f(GLES20.glGetUniformLocation(programaPuntos, "uColor"), r, g, b, 1f)
      GLES20.glUniform1i(GLES20.glGetUniformLocation(programaPuntos, "uEsPunto"), if (modo == GLES20.GL_POINTS) 1 else 0)
      atributo(programaPuntos, "aPos", buffer(puntos), 2)
      GLES20.glDrawArrays(modo, 0, puntos.size / 2)
    }
    session()?.getAllTrackables(Plane::class.java)?.filter {
      it.trackingState == TrackingState.TRACKING && it.subsumedBy == null && it.type == Plane.Type.HORIZONTAL_UPWARD_FACING
    }?.take(4)?.forEach { plano ->
      val polygon = plano.polygon.duplicate()
      val poses = mutableListOf<Pose>()
      while (polygon.remaining() >= 2) poses.add(plano.centerPose.compose(Pose.makeTranslation(polygon.get(), 0f, polygon.get())))
      val puntos = proyectar(poses)
      // No unir extremos recortados detrás de la cámara.
      if (puntos.size == poses.size * 2) dibujar(puntos, GLES20.GL_LINE_LOOP, 0.25f, 0.7f, 1f)
    }
    dibujar(proyectar(candidatosPendientes.filter { it.ancla.trackingState == TrackingState.TRACKING }.map { it.ancla.pose }),
      GLES20.GL_POINTS, 1f, 0.7f, 0.15f)
    val confirmadas = synchronized(anclas) { anclas.filter { it.trackingState == TrackingState.TRACKING }.map { it.pose } }
    dibujar(proyectar(confirmadas), GLES20.GL_POINTS, 0.29f, 0.87f, 0.50f)
    val ahora = SystemClock.elapsedRealtime()
    if (ahora - ultimasEtiquetas >= 100L) {
      ultimasEtiquetas = ahora
      val marcas = synchronized(anclas) {
        anclas.mapIndexedNotNull { index, marca ->
          if (marca.trackingState != TrackingState.TRACKING) return@mapIndexedNotNull null
          val xy = proyectar(listOf(marca.pose))
          if (xy.size != 2 || xy[0] !in -1f..1f || xy[1] !in -1f..1f) null
          else ArLabel(index + 1, (xy[0] + 1f) / 2f, (1f - xy[1]) / 2f)
        }
      }
      onMarcas(marcas)
    }
    GLES20.glDisable(GLES20.GL_BLEND)
  }

  private fun avisar(mensaje: String) {
    if (SystemClock.elapsedRealtime() < avisoHasta) return
    aviso = mensaje
    avisoHasta = SystemClock.elapsedRealtime() + 3_000L
  }

  private fun publicar(mensaje: String) {
    val ahora = SystemClock.elapsedRealtime()
    // Incluso con tracking intermitente el mensaje se renueva: no exigir
    // 500 ms continuos del mismo texto para salir de "Iniciando seguimiento".
    if (estadoMostrado.isBlank() || ahora - mostradoDesde >= 2500L) {
      if (estadoMostrado != mensaje) mostradoDesde = ahora
      estadoMostrado = mensaje
    }
    val detalle = "$diagnosticoDetector\nSeguimiento: ${if (ultimoTracking == TrackingState.TRACKING) "estable" else "en pausa ($motivoTracking)"} · Planos: $planosDisponibles · Profundidad: ${if (ultimaProfundidad) "sí" else "esperando"}\nPor ubicar: ${resultados.size} imágenes · En cola: ${capturasPendientes.size + if (inferenciaActiva.get()) 1 else 0}"
    if (detalle != ultimoDiagnostico && ahora - diagnosticoDesde >= 1000L) {
      ultimoDiagnostico = detalle
      diagnosticoDesde = ahora
      onDiagnostico(detalle)
    }
    val clave = "$estadoMostrado:${totalAnclas()}"
    if (clave == ultimoEstado) return
    ultimoEstado = clave
    onEstado(estadoMostrado, totalAnclas())
  }

  private fun atributo(programa: Int, nombre: String, datos: FloatBuffer, componentes: Int) {
    val ubicacion = GLES20.glGetAttribLocation(programa, nombre)
    datos.position(0)
    GLES20.glEnableVertexAttribArray(ubicacion)
    GLES20.glVertexAttribPointer(ubicacion, componentes, GLES20.GL_FLOAT, false, 0, datos)
  }

  companion object {
    private const val TAG = "NativeArCore"
    private const val DETECCIONES_PARA_CONFIRMAR = 2
    private const val VIGENCIA_CANDIDATO_MS = 30_000L
    private const val FRAMES_PARA_ANCLAR = 2
    private const val INTERVALO_DETECCION_MS = 350L
    // El fallback de hit-test actual no puede desplazar centímetros un objeto
    // pequeño. El recorrido normal usa la geometría de la captura anclada.
    private const val MOVIMIENTO_MAXIMO_METROS = 0.008f
    private const val GIRO_MAXIMO_GRADOS = 0.8
    private const val VERTEX_CAMARA = "attribute vec2 aPos; attribute vec2 aUv; varying vec2 vUv; void main(){ vUv=aUv; gl_Position=vec4(aPos,0.0,1.0); }"
    private const val FRAGMENT_CAMARA = "#extension GL_OES_EGL_image_external : require\nprecision mediump float; varying vec2 vUv; uniform samplerExternalOES uTexture; void main(){ gl_FragColor=texture2D(uTexture,vUv); }"
    private const val VERTEX_PUNTOS = "attribute vec2 aPos; void main(){ gl_Position=vec4(aPos,0.0,1.0); gl_PointSize=30.0; }"
    private const val FRAGMENT_PUNTOS = "precision mediump float; uniform vec4 uColor; uniform bool uEsPunto; void main(){ if(uEsPunto && length(gl_PointCoord-vec2(0.5))>0.5) discard; gl_FragColor=uColor; }"

    private fun imagenAnotada(jpeg: ByteArray, detecciones: List<ArDetection>, rotacion: Int): Bitmap {
      val original = requireNotNull(BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size))
      val imagen = requireNotNull(original.copy(Bitmap.Config.ARGB_8888, true))
      original.recycle()
      val canvas = Canvas(imagen)
      val pincel = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        style = Paint.Style.STROKE
        strokeWidth = 3f
      }
      for (d in detecciones) canvas.drawRect(
        (d.cx - d.w / 2) * imagen.width, (d.cy - d.h / 2) * imagen.height,
        (d.cx + d.w / 2) * imagen.width, (d.cy + d.h / 2) * imagen.height, pincel)
      if (rotacion == 0) return imagen
      val girada = Bitmap.createBitmap(imagen, 0, 0, imagen.width, imagen.height,
        Matrix().apply { postRotate(rotacion.toFloat()) }, true)
      if (girada !== imagen) imagen.recycle()
      return girada
    }

    private fun buffer(valores: FloatArray): FloatBuffer = ByteBuffer
      .allocateDirect(valores.size * 4)
      .order(ByteOrder.nativeOrder())
      .asFloatBuffer()
      .apply { put(valores); position(0) }

    private fun crearTexturaExterna(): Int {
      val texturas = IntArray(1)
      GLES20.glGenTextures(1, texturas, 0)
      GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, texturas[0])
      GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
      GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
      GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
      GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
      return texturas[0]
    }

    private fun programa(vertex: String, fragment: String): Int {
      fun compilar(tipo: Int, codigo: String): Int = GLES20.glCreateShader(tipo).also { shader ->
        GLES20.glShaderSource(shader, codigo)
        GLES20.glCompileShader(shader)
        val estado = IntArray(1)
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, estado, 0)
        if (estado[0] == 0) {
          val detalle = GLES20.glGetShaderInfoLog(shader)
          GLES20.glDeleteShader(shader)
          error("Shader inválido: $detalle")
        }
      }
      return GLES20.glCreateProgram().also { resultado ->
        GLES20.glAttachShader(resultado, compilar(GLES20.GL_VERTEX_SHADER, vertex))
        GLES20.glAttachShader(resultado, compilar(GLES20.GL_FRAGMENT_SHADER, fragment))
        GLES20.glLinkProgram(resultado)
        val estado = IntArray(1)
        GLES20.glGetProgramiv(resultado, GLES20.GL_LINK_STATUS, estado, 0)
        if (estado[0] == 0) {
          val detalle = GLES20.glGetProgramInfoLog(resultado)
          GLES20.glDeleteProgram(resultado)
          error("Programa OpenGL inválido: $detalle")
        }
      }
    }
  }
}

private data class ResultadoDeteccion(
  val detecciones: List<ArDetection>,
  val anchoImagen: Int,
  val altoImagen: Int,
  val error: String?,
  val generacion: Long,
  val geometria: ArCaptureGeometry,
  val capturadoEn: Long,
  val duracionMs: Long,
  val loteId: Long = capturadoEn,
  val reintentarEn: Long = 0L,
)

private data class CapturaPendiente(
  val imagen: ArDetectionClient.ImagenCopiada,
  val rotacion: Int,
  val geometria: ArCaptureGeometry,
  val generacion: Long,
  val capturadoEn: Long,
)

private data class CandidatoEspacial(
  val ancla: ArSpatialMap.Marca,
  var vistas: Int,
  var ultimoVisto: Long,
  var ultimoLote: Long,
)

private data class ArLabel(val id: Int, val x: Float, val y: Float)

private class ArLabelsView(context: Context) : View(context) {
  private var marcas: List<ArLabel> = emptyList()
  private val densidad = resources.displayMetrics.density
  private val pincel = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    textSize = 14f * densidad
    isFakeBoldText = true
    setShadowLayer(3f * densidad, 0f, 0f, Color.BLACK)
  }

  fun actualizar(nuevas: List<ArLabel>) {
    marcas = nuevas
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    pincel.color = Color.rgb(74, 222, 128)
    for (marca in marcas) canvas.drawText("#${marca.id}",
      marca.x * width + 12f * densidad, marca.y * height - 8f * densidad, pincel)
  }
}
