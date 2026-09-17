package com.gokudouglas.objectcounterapp

import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

data class ArDetection(
  val cx: Float,
  val cy: Float,
  val w: Float,
  val h: Float,
  val confianza: Float,
)

/** Cliente deliberadamente pequeño para reutilizar el detector del backend en AR. */
object ArDetectionClient {
  data class ImagenCopiada(val width: Int, val height: Int, val nv21: ByteArray)

  fun copiarImagen(image: Image): ImagenCopiada {
    val width = image.width
    val height = image.height
    val nv21 = ByteArray(width * height * 3 / 2)
    copiarPlano(image.planes[0], width, height, nv21, 0, 1)

    // NV21 intercala V y U. Copiamos cada muestra respetando row/pixel stride;
    // asumir planos contiguos falla en varios fabricantes Android.
    val v = image.planes[2]
    val u = image.planes[1]
    val datosV = v.buffer.duplicate()
    val datosU = u.buffer.duplicate()
    val baseV = datosV.position()
    val baseU = datosU.position()
    var destino = width * height
    for (fila in 0 until height / 2) {
      val filaV = baseV + fila * v.rowStride
      val filaU = baseU + fila * u.rowStride
      for (columna in 0 until width / 2) {
        nv21[destino++] = datosV.get(filaV + columna * v.pixelStride)
        nv21[destino++] = datosU.get(filaU + columna * u.pixelStride)
      }
    }
    return ImagenCopiada(width, height, nv21)
  }

  fun imageToJpeg(image: ImagenCopiada, calidad: Int = 72): ByteArray {
    return ByteArrayOutputStream().use { salida ->
      check(YuvImage(image.nv21, ImageFormat.NV21, image.width, image.height, null)
        .compressToJpeg(Rect(0, 0, image.width, image.height), calidad, salida)) { "No se pudo convertir la imagen" }
      salida.toByteArray()
    }
  }

  private fun copiarPlano(
    plano: Image.Plane,
    width: Int,
    height: Int,
    destino: ByteArray,
    offset: Int,
    saltoDestino: Int,
  ) {
    var indice = offset
    val datos = plano.buffer.duplicate()
    val base = datos.position()
    for (fila in 0 until height) {
      val inicioFila = base + fila * plano.rowStride
      if (plano.pixelStride == 1 && saltoDestino == 1) {
        datos.position(inicioFila)
        datos.get(destino, indice, width)
        indice += width
        continue
      }
      for (columna in 0 until width) {
        destino[indice] = datos.get(inicioFila + columna * plano.pixelStride)
        indice += saltoDestino
      }
    }
  }

  fun detectar(
    backendUrl: String,
    clase: String,
    referenciaId: String?,
    rotacion: Int,
    jpeg: ByteArray,
    frameId: Long,
  ): List<ArDetection> {
    val parametros = buildString {
      append("modo=ar_espacial")
      append("&ar_frame=").append(frameId)
      append("&clase_filtro=").append(codificar(clase))
      append("&rotacion=").append(rotacion)
      if (!referenciaId.isNullOrBlank()) append("&referencia_id=").append(codificar(referenciaId))
    }
    val conexion = URL("${backendUrl.trimEnd('/')}/detect?$parametros")
      .openConnection() as HttpURLConnection
    val limite = "ArBoundary${System.nanoTime()}"
    try {
      conexion.requestMethod = "POST"
      conexion.connectTimeout = 8_000
      conexion.readTimeout = 20_000
      conexion.doOutput = true
      conexion.setRequestProperty("Content-Type", "multipart/form-data; boundary=$limite")
      conexion.outputStream.use { salida ->
        salida.write("--$limite\r\n".toByteArray())
        salida.write("Content-Disposition: form-data; name=\"file\"; filename=\"ar-frame.jpg\"\r\n".toByteArray())
        salida.write("Content-Type: image/jpeg\r\n\r\n".toByteArray())
        salida.write(jpeg)
        salida.write("\r\n--$limite--\r\n".toByteArray())
      }
      if (conexion.responseCode !in 200..299) {
        val detalle = runCatching {
          val cuerpo = conexion.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
          JSONObject(cuerpo).optString("detail").take(220)
        }.getOrNull().orEmpty()
        throw IllegalStateException(detalle.ifBlank { "El detector respondió ${conexion.responseCode}" })
      }
      val json = JSONObject(conexion.inputStream.bufferedReader().use { it.readText() })
      val objetos = json.getJSONArray("objetos")
      return buildList {
        for (indice in 0 until objetos.length()) {
          val item = objetos.getJSONObject(indice)
          add(ArDetection(
            cx = item.getDouble("cx").toFloat(),
            cy = item.getDouble("cy").toFloat(),
            w = item.getDouble("w").toFloat(),
            h = item.getDouble("h").toFloat(),
            confianza = item.optDouble("confianza", 0.0).toFloat(),
          ))
        }
      }
    } finally {
      conexion.disconnect()
    }
  }

  private fun codificar(valor: String): String = URLEncoder.encode(valor, Charsets.UTF_8.name())
}
