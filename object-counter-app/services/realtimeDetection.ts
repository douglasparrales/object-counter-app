import { BACKEND_URL } from '../config/backend';
import type { SeleccionReferencia } from '../components/ReferenceSelector';

export type DeteccionTiempoReal = {
  clase: string;
  confianza: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  frame_width: number;
  frame_height: number;
};

export type ResultadoIdentificacionRemota = {
  exito: boolean;
  clase: string | null;
  confianza: number;
  referenciaId: string | null;
};

export interface ProveedorDeteccionTiempoReal {
  detectar(uri: string, claseFiltro: string, referenciaId: string | null): Promise<DeteccionTiempoReal[]>;
}

async function fetchConTimeout(url: string, options: RequestInit, timeoutMs = 20_000) {
  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controlador.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export const proveedorBackend: ProveedorDeteccionTiempoReal = {
  async detectar(uri, claseFiltro, referenciaId) {
    const formData = new FormData();
    formData.append('file', { uri, type: 'image/jpeg', name: 'frame.jpg' } as any);
    const parametros = new URLSearchParams({ modo: 'tiempo_real' });
    if (claseFiltro) parametros.set('clase_filtro', claseFiltro);
    if (referenciaId) parametros.set('referencia_id', referenciaId);
    const url = `${BACKEND_URL}/detect?${parametros.toString()}`;
    const response = await fetchConTimeout(url, { method: 'POST', body: formData });
    if (!response.ok) throw new Error(`Error ${response.status}`);
    const data = await response.json();
    return Array.isArray(data.objetos) ? data.objetos : [];
  },
};

export async function identificarReferencia(
  uri: string,
  nombre: string,
  seleccion: SeleccionReferencia,
): Promise<ResultadoIdentificacionRemota> {
  const formData = new FormData();
  formData.append('file', { uri, type: 'image/jpeg', name: 'referencia.jpg' } as any);
  const parametros = new URLSearchParams({
    prompt: nombre.trim(),
    seleccion_x: String(seleccion.x),
    seleccion_y: String(seleccion.y),
    seleccion_w: String(seleccion.w),
    seleccion_h: String(seleccion.h),
  });
  const url = `${BACKEND_URL}/identify?${parametros.toString()}`;
  const response = await fetchConTimeout(url, { method: 'POST', body: formData }, 60_000);
  if (!response.ok) throw new Error(`Error ${response.status}`);
  const data = await response.json();
  return {
    exito: Boolean(data.exito && data.clase),
    clase: data.clase ?? null,
    confianza: data.confianza ?? 0,
    referenciaId: data.referencia_id ?? null,
  };
}
