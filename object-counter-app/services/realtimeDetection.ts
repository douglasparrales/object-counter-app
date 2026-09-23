import { getBackendUrl } from '../config/backend';
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

export type ResultadoBarrido = {
  total: number;
  estado: 'INICIANDO' | 'SIGUIENDO' | 'SIN_COINCIDENCIA';
  coincidencias: number;
  objetos: (DeteccionTiempoReal & { id: number; confirmado: boolean })[];
};

const servidoresSesion = new Map<string, string>();

export async function crearBarrido(referenciaId: string) {
  const baseUrl = await getBackendUrl();
  if (!baseUrl) throw new Error('Configura primero la dirección del servidor.');
  const response = await fetchConTimeout(`${baseUrl}/scan/sessions?referencia_id=${encodeURIComponent(referenciaId)}`, { method: 'POST' });
  if (!response.ok) throw new Error('No se pudo iniciar el barrido. Revisa el backend y vuelve a seleccionar la referencia.');
  const sesion = (await response.json()).sesion as string;
  servidoresSesion.set(sesion, baseUrl);
  return sesion;
}

export async function cerrarBarrido(sesion: string) {
  const baseUrl = servidoresSesion.get(sesion);
  servidoresSesion.delete(sesion);
  if (baseUrl) await fetchConTimeout(`${baseUrl}/scan/sessions/${encodeURIComponent(sesion)}`, { method: 'DELETE' }).catch(() => {});
}

export async function detectarBarrido(uri: string, clase: string, referencia: string, sesion: string, secuencia: number): Promise<ResultadoBarrido> {
  const baseUrl = servidoresSesion.get(sesion);
  if (!baseUrl) throw new Error('El conteo ya no está activo. Inicia otro conteo.');
  const body = new FormData();
  body.append('file', { uri, type: 'image/jpeg', name: 'barrido.jpg' } as any);
  const query = new URLSearchParams({ modo: 'barrido', clase_filtro: clase, referencia_id: referencia, sesion, secuencia: String(secuencia) });
  const response = await fetchConTimeout(`${baseUrl}/detect?${query}`, { method: 'POST', body });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Error del barrido (${response.status})`);
  }
  return response.json();
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
    const baseUrl = await getBackendUrl();
    if (!baseUrl) throw new Error('Configura primero la dirección del backend.');
    const url = `${baseUrl}/detect?${parametros.toString()}`;
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
  const baseUrl = await getBackendUrl();
  if (!baseUrl) throw new Error('Configura primero la dirección del backend.');
  const url = `${baseUrl}/identify?${parametros.toString()}`;
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
