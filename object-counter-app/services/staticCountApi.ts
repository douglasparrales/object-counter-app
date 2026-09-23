import { getBackendUrl } from '../config/backend';

export type ObjetoConteoEstatico = {
  id: number;
  clase: string;
  confianza: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
};

export type ResultadoConteoEstatico = {
  total: number;
  resumen: Record<string, number>;
  objetos: ObjetoConteoEstatico[];
  imagenAnotada: string | null;
  imagenMosaicos: string | null;
  diagnostico: {
    ruta: string;
    mosaicos: number;
    duracionSegundos: number;
  };
};

export type SeleccionVisual = { x: number; y: number; w: number; h: number };

export async function contarFotoEstatica(
  uri: string,
  objetivo: string,
  seleccion: SeleccionVisual,
): Promise<ResultadoConteoEstatico> {
  const formData = new FormData();
  formData.append('file', { uri, type: 'image/jpeg', name: 'conteo.jpg' } as any);
  formData.append('objetivo', objetivo.trim());
  formData.append('seleccion_x', String(seleccion.x));
  formData.append('seleccion_y', String(seleccion.y));
  formData.append('seleccion_w', String(seleccion.w));
  formData.append('seleccion_h', String(seleccion.h));
  const baseUrl = await getBackendUrl();
  if (!baseUrl) throw new Error('Configura primero la dirección del backend.');
  const url = `${baseUrl}/count-image`;
  console.log(`[Foto directa] Enviando imagen a ${url}`);
  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), 120_000);
  let data: any;
  try {
    const response = await fetch(url, { method: 'POST', body: formData, signal: controlador.signal });
    if (!response.ok) throw new Error(`Error ${response.status}`);
    data = await response.json();
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error('El backend tardó más de 120 segundos en responder.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  return {
    total: data.total ?? 0,
    resumen: data.resumen ?? {},
    objetos: Array.isArray(data.objetos) ? data.objetos : [],
    imagenAnotada: data.imagen_anotada_base64
      ? `data:image/jpeg;base64,${data.imagen_anotada_base64}`
      : null,
    imagenMosaicos: data.imagen_mosaicos_base64
      ? `data:image/jpeg;base64,${data.imagen_mosaicos_base64}`
      : null,
    diagnostico: {
      ruta: data.diagnostico?.ruta ?? 'desconocida',
      mosaicos: data.diagnostico?.mosaicos ?? 0,
      duracionSegundos: data.diagnostico?.duracion_segundos ?? 0,
    },
  };
}
