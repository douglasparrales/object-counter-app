package com.gokudouglas.objectcounterapp

import com.google.ar.core.Config
import com.google.ar.core.Coordinates2d
import com.google.ar.core.Frame
import com.google.ar.core.Session
import com.google.ar.core.exceptions.NotYetAvailableException
import com.google.ar.core.exceptions.NotTrackingException
import java.nio.ByteOrder
import kotlin.math.abs

/** Copia inmutable: nunca consultar profundidad del frame de llegada del HTTP. */
class ArDepthSnapshot private constructor(
  private val width: Int,
  private val height: Int,
  private val mm: IntArray,
  private val uv: FloatArray,
) {
  fun metros(cx: Float, cy: Float): Float? {
    // IMAGE_NORMALIZED -> textura de profundidad; incluye el recorte del sensor.
    val u = uv[0] + cx * (uv[2] - uv[0]) + cy * (uv[4] - uv[0])
    val v = uv[1] + cx * (uv[3] - uv[1]) + cy * (uv[5] - uv[1])
    if (u !in 0f..1f || v !in 0f..1f) return null
    val x = (u * width).toInt().coerceIn(0, width - 1)
    val y = (v * height).toInt().coerceIn(0, height - 1)
    val valores = mutableListOf<Int>()
    for (dy in -1..1) for (dx in -1..1) {
      val px = x + dx
      val py = y + dy
      if (px !in 0 until width || py !in 0 until height) continue
      val valor = mm[py * width + px]
      if (valor in 150..3000) valores.add(valor)
    }
    if (valores.size < 5) return null
    valores.sort()
    val mediana = valores[valores.size / 2]
    // No anclar bordes con saltos de profundidad ni valores aislados.
    if (valores.count { abs(it - mediana) <= 20 } < (valores.size * 0.8).toInt() + 1) return null
    return mediana / 1000f
  }

  companion object {
    fun capturar(frame: Frame, session: Session): ArDepthSnapshot? {
      if (session.config.depthMode != Config.DepthMode.AUTOMATIC) return null
      return try {
        frame.acquireDepthImage16Bits().use { image ->
          // En equipos saturados ARCore puede devolver profundidad antigua.
          if (image.timestamp != frame.timestamp) return null
          val plane = image.planes[0]
          val data = plane.buffer.duplicate().order(ByteOrder.LITTLE_ENDIAN)
          val base = data.position()
          val valores = IntArray(image.width * image.height)
          for (y in 0 until image.height) for (x in 0 until image.width) {
            valores[y * image.width + x] = data.getShort(base + y * plane.rowStride + x * plane.pixelStride).toInt() and 0xffff
          }
          val uv = FloatArray(6)
          frame.transformCoordinates2d(Coordinates2d.IMAGE_NORMALIZED,
            floatArrayOf(0f, 0f, 1f, 0f, 0f, 1f), Coordinates2d.TEXTURE_NORMALIZED, uv)
          ArDepthSnapshot(image.width, image.height, valores, uv)
        }
      } catch (_: NotYetAvailableException) { null }
      catch (_: NotTrackingException) { null }
    }
  }
}
