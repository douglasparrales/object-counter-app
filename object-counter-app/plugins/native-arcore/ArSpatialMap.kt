package com.gokudouglas.objectcounterapp

import com.google.ar.core.Anchor
import com.google.ar.core.Pose
import com.google.ar.core.TrackingState

/** Los objetos de una zona comparten el mismo marco; no derivan por separado. */
class ArSpatialMap {
  class Marca(private val referencia: Anchor, private val local: Pose) {
    var radioAsociacion = 0.018f
    val pose: Pose get() = referencia.pose.compose(local)
    val trackingState: TrackingState get() = referencia.trackingState
  }

  private val regiones = mutableListOf<Anchor>()

  fun ubicar(pose: Pose, crear: () -> Anchor): Marca {
    val cercana = regiones.filter { it.trackingState == TrackingState.TRACKING }
      .minByOrNull { distancia2(it.pose, pose) }
      ?.takeIf { distancia2(it.pose, pose) <= 1.5f * 1.5f }
    val referencia = cercana ?: crear().also { regiones.add(it) }
    return Marca(referencia, referencia.pose.inverse().compose(pose))
  }

  fun limpiar() {
    regiones.forEach { it.detach() }
    regiones.clear()
  }

  private fun distancia2(a: Pose, b: Pose): Float =
    (a.tx() - b.tx()) * (a.tx() - b.tx()) +
      (a.ty() - b.ty()) * (a.ty() - b.ty()) +
      (a.tz() - b.tz()) * (a.tz() - b.tz())
}
