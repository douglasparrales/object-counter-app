package com.gokudouglas.objectcounterapp

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import com.google.ar.core.Anchor
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Config
import com.google.ar.core.Coordinates2d
import com.google.ar.core.DepthPoint
import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.util.concurrent.ConcurrentLinkedQueue
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

class NativeArCoreActivity : Activity() {
  private lateinit var superficie: GLSurfaceView
  private lateinit var estado: TextView
  private lateinit var total: TextView
  private lateinit var renderer: ArRenderer
  private var session: Session? = null
  private var instalacionSolicitada = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.statusBarColor = Color.TRANSPARENT
    window.navigationBarColor = Color.BLACK

    val raiz = FrameLayout(this)
    superficie = GLSurfaceView(this).apply {
      setEGLContextClientVersion(2)
      preserveEGLContextOnPause = true
    }
    renderer = ArRenderer(
      session = { session },
      rotation = { windowManager.defaultDisplay.rotation },
      onEstado = { mensaje, cantidad ->
        runOnUiThread {
          estado.text = mensaje
          total.text = cantidad.toString()
        }
      },
    )
    superficie.setRenderer(renderer)
    superficie.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
    superficie.setOnTouchListener { _, evento ->
      if (evento.action == MotionEvent.ACTION_UP) renderer.registrarToque(evento.x, evento.y)
      true
    }
    raiz.addView(superficie, FrameLayout.LayoutParams(-1, -1))

    val hud = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(30, 24, 30, 24)
      setBackgroundColor(Color.argb(215, 0, 0, 0))
    }
    val nombre = intent.getStringExtra(EXTRA_NOMBRE) ?: "Objeto"
    hud.addView(TextView(this).apply {
      text = nombre
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
      textSize = 14f
      setTextColor(Color.WHITE)
    }
    hud.addView(estado)
    raiz.addView(hud, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.START).apply {
      setMargins(24, 56, 24, 0)
    })

    val acciones = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    acciones.addView(Button(this).apply {
      text = "Reiniciar"
      setOnClickListener { renderer.limpiarAnclas() }
    })
    acciones.addView(Button(this).apply {
      text = "Finalizar"
      setOnClickListener { finalizar(true) }
    })
    raiz.addView(acciones, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM).apply {
      setMargins(24, 0, 24, 48)
    })
    setContentView(raiz)
  }

  override fun onResume() {
    super.onResume()
    if (session == null) {
      try {
        when (ArCoreApk.getInstance().requestInstall(this, !instalacionSolicitada)) {
          ArCoreApk.InstallStatus.INSTALL_REQUESTED -> {
            instalacionSolicitada = true
            return
          }
          ArCoreApk.InstallStatus.INSTALLED -> Unit
        }
        session = Session(this).also { nueva ->
          val config = Config(nueva).apply {
            planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
            focusMode = Config.FocusMode.AUTO
            if (nueva.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
              depthMode = Config.DepthMode.AUTOMATIC
            }
          }
          nueva.configure(config)
        }
      } catch (error: Exception) {
        Toast.makeText(this, "No se pudo iniciar ARCore: ${error.message}", Toast.LENGTH_LONG).show()
        finalizar(false)
        return
      }
    }
    try {
      session?.resume()
      superficie.onResume()
    } catch (error: Exception) {
      Toast.makeText(this, "ARCore no está disponible: ${error.message}", Toast.LENGTH_LONG).show()
      finalizar(false)
    }
  }

  override fun onPause() {
    superficie.onPause()
    session?.pause()
    super.onPause()
  }

  override fun onDestroy() {
    renderer.limpiarAnclas()
    session?.close()
    session = null
    super.onDestroy()
  }

  @Deprecated("Deprecated in Android")
  override fun onBackPressed() = finalizar(false)

  private fun finalizar(completado: Boolean) {
    setResult(
      if (completado) RESULT_OK else RESULT_CANCELED,
      Intent().putExtra(EXTRA_TOTAL, renderer.totalAnclas()),
    )
    finish()
  }

  companion object {
    const val EXTRA_NOMBRE = "nombre"
    const val EXTRA_TOTAL = "total"
  }
}

private class ArRenderer(
  private val session: () -> Session?,
  private val rotation: () -> Int,
  private val onEstado: (String, Int) -> Unit,
) : GLSurfaceView.Renderer {
  private val toques = ConcurrentLinkedQueue<Pair<Float, Float>>()
  private val anclas = mutableListOf<Anchor>()
  private var texturaCamara = 0
  private var programaCamara = 0
  private var programaPuntos = 0
  private var ancho = 1
  private var alto = 1
  private var geometriaPendiente = true
  private var ultimoEstado = ""
  private var ultimoTracking = TrackingState.PAUSED
  @Volatile private var framesEstables = 0
  private val vertices = buffer(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f))
  private val uv = buffer(FloatArray(8))

  fun registrarToque(x: Float, y: Float) {
    if (framesEstables < FRAMES_PARA_ANCLAR) {
      publicar("Calibrando superficie · mueve la cámara lentamente")
      return
    }
    toques.add(x to y)
  }

  fun limpiarAnclas() {
    synchronized(anclas) {
      anclas.forEach(Anchor::detach)
      anclas.clear()
    }
    publicar("Toca el centro de cada objeto para crear un ancla")
  }

  fun totalAnclas(): Int = synchronized(anclas) { anclas.size }

  override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
    GLES20.glClearColor(0f, 0f, 0f, 1f)
    texturaCamara = crearTexturaExterna()
    programaCamara = programa(VERTEX_CAMARA, FRAGMENT_CAMARA)
    programaPuntos = programa(VERTEX_PUNTOS, FRAGMENT_PUNTOS)
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
    try {
      activa.setCameraTextureName(texturaCamara)
      if (geometriaPendiente) {
        activa.setDisplayGeometry(rotation(), ancho, alto)
        geometriaPendiente = false
      }
      val frame = activa.update()
      dibujarCamara(frame)
      if (frame.camera.trackingState != TrackingState.TRACKING) {
        framesEstables = 0
        if (ultimoTracking != frame.camera.trackingState) {
          Log.d(TAG, "Tracking de cámara: ${frame.camera.trackingState}")
          ultimoTracking = frame.camera.trackingState
        }
        publicar("Tracking pausado · apunta otra vez a la superficie")
        return
      }
      framesEstables = (framesEstables + 1).coerceAtMost(FRAMES_PARA_ANCLAR)
      if (ultimoTracking != TrackingState.TRACKING) {
        Log.d(TAG, "Tracking de cámara recuperado")
        ultimoTracking = TrackingState.TRACKING
      }
      procesarToques(frame)
      dibujarAnclas(frame)
      publicar(
        if (framesEstables < FRAMES_PARA_ANCLAR)
          "Calibrando superficie · mueve la cámara lentamente"
        else "Superficie estable · toca la base de cada objeto"
      )
    } catch (error: Exception) {
      publicar("ARCore ajustando la sesión…")
    }
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
          objetivo.isPoseInPolygon(hit.hitPose)
      } ?: impactos.firstOrNull { hit ->
        hit.trackable is DepthPoint && hit.trackable.trackingState == TrackingState.TRACKING
      }
      if (impacto == null) {
        publicar("Toca la mesa junto a la base del objeto")
      } else synchronized(anclas) {
        val pose = impacto.hitPose
        val duplicada = anclas.any { ancla ->
          val actual = ancla.pose
          val dx = actual.tx() - pose.tx()
          val dy = actual.ty() - pose.ty()
          val dz = actual.tz() - pose.tz()
          dx * dx + dy * dy + dz * dz < DISTANCIA_DUPLICADO_METROS * DISTANCIA_DUPLICADO_METROS
        }
        if (duplicada) {
          publicar("Ese lugar ya fue contado")
          Log.d(TAG, "Toque descartado por proximidad a un ancla existente")
        } else {
          anclas.add(impacto.createAnchor())
          Log.d(TAG, "Ancla creada con ${impacto.trackable.javaClass.simpleName}. Total: ${anclas.size}")
          publicar("Objeto marcado correctamente")
        }
      }
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
    val puntos = mutableListOf<Float>()
    synchronized(anclas) {
      anclas.filter { it.trackingState == TrackingState.TRACKING }.forEach { ancla ->
        val p = ancla.pose
        val salida = FloatArray(4)
        android.opengl.Matrix.multiplyMV(salida, 0, vp, 0, floatArrayOf(p.tx(), p.ty(), p.tz(), 1f), 0)
        if (salida[3] > 0f) {
          puntos.add(salida[0] / salida[3])
          puntos.add(salida[1] / salida[3])
        }
      }
    }
    if (puntos.isEmpty()) return
    val datos = buffer(puntos.toFloatArray())
    GLES20.glEnable(GLES20.GL_BLEND)
    GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)
    GLES20.glUseProgram(programaPuntos)
    atributo(programaPuntos, "aPos", datos, 2)
    GLES20.glDrawArrays(GLES20.GL_POINTS, 0, puntos.size / 2)
    GLES20.glDisable(GLES20.GL_BLEND)
  }

  private fun publicar(mensaje: String) {
    val clave = "$mensaje:${totalAnclas()}"
    if (clave == ultimoEstado) return
    ultimoEstado = clave
    onEstado(mensaje, totalAnclas())
  }

  private fun atributo(programa: Int, nombre: String, datos: FloatBuffer, componentes: Int) {
    val ubicacion = GLES20.glGetAttribLocation(programa, nombre)
    datos.position(0)
    GLES20.glEnableVertexAttribArray(ubicacion)
    GLES20.glVertexAttribPointer(ubicacion, componentes, GLES20.GL_FLOAT, false, 0, datos)
  }

  companion object {
    private const val TAG = "NativeArCore"
    private const val DISTANCIA_DUPLICADO_METROS = 0.10f
    private const val FRAMES_PARA_ANCLAR = 5
    private const val VERTEX_CAMARA = "attribute vec2 aPos; attribute vec2 aUv; varying vec2 vUv; void main(){ vUv=aUv; gl_Position=vec4(aPos,0.0,1.0); }"
    private const val FRAGMENT_CAMARA = "#extension GL_OES_EGL_image_external : require\nprecision mediump float; varying vec2 vUv; uniform samplerExternalOES uTexture; void main(){ gl_FragColor=texture2D(uTexture,vUv); }"
    private const val VERTEX_PUNTOS = "attribute vec2 aPos; void main(){ gl_Position=vec4(aPos,0.0,1.0); gl_PointSize=30.0; }"
    private const val FRAGMENT_PUNTOS = "precision mediump float; void main(){ vec2 p=gl_PointCoord-vec2(0.5); if(length(p)>0.5) discard; gl_FragColor=vec4(0.29,0.87,0.50,1.0); }"

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
      }
      return GLES20.glCreateProgram().also { resultado ->
        GLES20.glAttachShader(resultado, compilar(GLES20.GL_VERTEX_SHADER, vertex))
        GLES20.glAttachShader(resultado, compilar(GLES20.GL_FRAGMENT_SHADER, fragment))
        GLES20.glLinkProgram(resultado)
      }
    }
  }
}
