package com.gokudouglas.objectcounterapp

import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.Pose
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import kotlin.math.abs

/** Geometría de la imagen enviada a YOLO. Sólo se usa y libera en el hilo GL. */
class ArCaptureGeometry(frame: Frame, session: Session, mapa: ArSpatialMap) {
  private data class Superficie(
    val ancla: ArSpatialMap.Marca,
    val camaraEnPlano: Pose,
    val poligono: FloatArray,
  )

  private val focal = frame.camera.imageIntrinsics.focalLength
  private val centro = frame.camera.imageIntrinsics.principalPoint
  private val dimensiones = frame.camera.imageIntrinsics.imageDimensions
  private val superficies = mutableListOf<Superficie>()
  private val anclaCamara = mapa.ubicar(frame.camera.pose) { session.createAnchor(frame.camera.pose) }
  private var liberada = false
  var motivo = "SIN_PLANOS"
    private set
  val numeroSuperficies: Int get() = superficies.size

  fun poseCamaraActual(): Pose? = if (!liberada && anclaCamara.trackingState == TrackingState.TRACKING) anclaCamara.pose else null

  fun completarSuperficies(session: Session, mapa: ArSpatialMap) {
    // Un plano puede aparecer durante la inferencia. La pose anclada de la
    // cámara permite resolver la imagen anterior sin usar el encuadre actual.
    if (liberada) return
    val camara = poseCamaraActual() ?: return
    // Reemplazar instantáneas: no acumular polígonos viejos en cada reintento.
    superficies.clear()
    session.getAllTrackables(Plane::class.java).filter {
      it.trackingState == TrackingState.TRACKING && it.subsumedBy == null && it.type == Plane.Type.HORIZONTAL_UPWARD_FACING
    }.take(4).forEach { plano ->
      val pose = plano.centerPose
      val polygon = plano.polygon.duplicate()
      val puntos = FloatArray(polygon.remaining()).also { polygon.get(it) }
      if (puntos.size >= 6) superficies.add(Superficie(
        mapa.ubicar(pose) { plano.createAnchor(pose) }, pose.inverse().compose(camara), puntos,
      ))
    }
  }

  init {
    try {
      session.getAllTrackables(Plane::class.java).filter {
        it.trackingState == TrackingState.TRACKING && it.subsumedBy == null &&
          it.type == Plane.Type.HORIZONTAL_UPWARD_FACING
      }.sortedBy {
        val p = it.centerPose
        val c = frame.camera.pose
        (p.tx() - c.tx()) * (p.tx() - c.tx()) + (p.tz() - c.tz()) * (p.tz() - c.tz())
      }.take(4).forEach { plano ->
        val pose = plano.centerPose
        val polygon = plano.polygon.duplicate()
        val puntos = FloatArray(polygon.remaining()).also { polygon.get(it) }
        if (puntos.size >= 6) superficies.add(Superficie(
          mapa.ubicar(pose) { plano.createAnchor(pose) }, pose.inverse().compose(frame.camera.pose), puntos,
        ))
      }
    } catch (error: Exception) {
      liberar()
      throw error
    }
  }

  fun resolver(cx: Float, cy: Float): Pose? {
    motivo = "SIN_PLANOS"
    if (!cx.isFinite() || !cy.isFinite() || cx !in 0f..1f || cy !in 0f..1f) {
      motivo = "COORDENADAS_INVALIDAS"
      return null
    }
    if (poseCamaraActual() == null) {
      motivo = "ANCLA_CAPTURA_SIN_TRACKING"
      return null
    }
    // IMAGE_PIXELS es la imagen del sensor, sin la rotación de la pantalla.
    val rayo = floatArrayOf(
      (cx * dimensiones[0] - centro[0]) / focal[0],
      -(cy * dimensiones[1] - centro[1]) / focal[1],
      -1f,
    )
    var distancia = Float.POSITIVE_INFINITY
    var resultado: Pose? = null
    for (superficie in superficies) {
      if (superficie.ancla.trackingState != TrackingState.TRACKING) {
        motivo = "ANCLA_PLANO_SIN_TRACKING"
        continue
      }
      val origen = superficie.camaraEnPlano.translation
      val direccion = superficie.camaraEnPlano.rotateVector(rayo)
      if (abs(direccion[1]) < 0.05f) { motivo = "RAYO_PARALELO"; continue }
      val t = -origen[1] / direccion[1]
      if (t < 0.1f || t > 3f) { motivo = "FUERA_DE_DISTANCIA"; continue }
      if (t >= distancia) continue
      val x = origen[0] + t * direccion[0]
      val z = origen[2] + t * direccion[2]
      if (!dentroDelPoligono(x, z, superficie.poligono)) { motivo = "FUERA_DEL_POLIGONO"; continue }
      distancia = t
      resultado = superficie.ancla.pose.compose(Pose.makeTranslation(x, 0f, z))
    }
    if (resultado != null) motivo = "UBICADO"
    return resultado
  }

  fun liberar() {
    if (liberada) return
    liberada = true
    // Las referencias pertenecen al mapa de la sesión; liberar una captura
    // no debe liberar el marco de los objetos ya contados.
    superficies.clear()
  }

  private fun dentroDelPoligono(x: Float, z: Float, p: FloatArray): Boolean {
    var dentro = false
    var j = p.size - 2
    for (i in p.indices step 2) {
      if ((p[i + 1] > z) != (p[j + 1] > z) &&
        x < (p[j] - p[i]) * (z - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) dentro = !dentro
      j = i
    }
    return dentro
  }
}
