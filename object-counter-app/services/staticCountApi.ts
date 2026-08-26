import { BACKEND_URL } from '../config/backend';

export type ResultadoConteoEstatico = {
  total: number;
  resumen: Record<string, number>;
  objetos: Array<{
    id: number;
    clase: string;
    confianza: number;
    cx: number;
    cy: number;
    w: number;
    h: number;
  }>;
  imagenAnotada: string | null;
  imagenMosaicos: string | null;
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
  const url = `${BACKEND_URL}/count-image`;
  console.log(`[Foto directa] Enviando imagen a ${url}`);
  const response = await fetch(url, { method: 'POST', body: formData });
  if (!response.ok) throw new Error(`Error ${response.status}`);
  const data = await response.json();

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
  };
}
