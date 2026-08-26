import { useState, useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import type { Camera } from 'react-native-vision-camera';
import { BACKEND_URL } from '../config/backend';

export type CajaGuardada = {
  id: number;
  clase: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
};

type Track = CajaGuardada & { vistas: number; confirmado: boolean; ultimoVisto: number };
type DeteccionRemota = Omit<CajaGuardada, 'id'> & { confianza: number };

export type ObjetoReferencia = {
  claseYolo: string;
  nombreUsuario: string;
  imagenUri: string;
  referenciaId: string | null;
};

export type ResultadoIdentificacion = {
  exito: boolean;
  clase: string | null;
  confianza: number;
  referenciaId: string | null;
};

const INTERVAL_MS = 400;
const IOU_MINIMO = 0.18;
const FRAMES_PARA_CONFIRMAR = 2;
const TIEMPO_MAXIMO_PARA_ASOCIAR_MS = 2200;
const TIEMPO_VISIBLE_EN_FRAME_MS = 1800;

function distancia(a: CajaGuardada, b: DeteccionRemota) {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy);
}

function iou(a: CajaGuardada, b: DeteccionRemota) {
  const ax1 = a.cx - a.w / 2;
  const ay1 = a.cy - a.h / 2;
  const ax2 = a.cx + a.w / 2;
  const ay2 = a.cy + a.h / 2;
  const bx1 = b.cx - b.w / 2;
  const by1 = b.cy - b.h / 2;
  const bx2 = b.cx + b.w / 2;
  const by2 = b.cy + b.h / 2;
  const interseccion = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1))
    * Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
  const union = a.w * a.h + b.w * b.h - interseccion;
  return union > 0 ? interseccion / union : 0;
}

function limiteDistancia(a: CajaGuardada, b: DeteccionRemota) {
  const tamano = Math.max(a.w, a.h, b.w, b.h);
  return Math.max(0.045, Math.min(0.12, tamano * 0.75));
}

export function useDetection() {
  const [cajasGuardadas, setCajasGuardadas] = useState<CajaGuardada[]>([]);
  const [totalContado, setTotalContado] = useState(0);
  const [isDetecting, setIsDetecting] = useState(false);
  const [objetoReferencia, setObjetoReferencia] = useState<ObjetoReferencia | null>(null);
  const [identificando, setIdentificando] = useState(false);
  const [claseDetectada, setClaseDetectada] = useState<string | null>(null);

  const cameraRef = useRef<Camera | null>(null);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunning = useRef(false);
  const tracksRef = useRef<Track[]>([]);
  const siguienteIdRef = useRef(1);
  const totalRef = useRef(0);

  const enviarFoto = useCallback(async (uri: string, claseFiltro = '', referenciaId: string | null = null, modo = 'tiempo_real') => {
    const formData = new FormData();
    formData.append('file', { uri, type: 'image/jpeg', name: 'photo.jpg' } as any);
    const parametros = new URLSearchParams();
    if (claseFiltro) parametros.set('clase_filtro', claseFiltro);
    if (referenciaId) parametros.set('referencia_id', referenciaId);
    parametros.set('modo', modo);
    const query = parametros.toString();
    const url = `${BACKEND_URL}/detect${query ? `?${query}` : ''}`;
    console.log(`[Backend] Enviando frame a ${url}`);
    const response = await fetch(url, { method: 'POST', body: formData });
    if (!response.ok) throw new Error(`Error ${response.status}`);
    return response.json();
  }, []);

  const identificarFoto = useCallback(async (uri: string, promptEs = ''): Promise<ResultadoIdentificacion> => {
    setIdentificando(true);
    try {
      const formData = new FormData();
      formData.append('file', { uri, type: 'image/jpeg', name: 'photo.jpg' } as any);
      const url = `${BACKEND_URL}/identify?prompt=${encodeURIComponent(promptEs.trim())}`;
      console.log(`[Backend] Enviando referencia a ${url}`);
      const response = await fetch(url, { method: 'POST', body: formData });
      if (!response.ok) throw new Error(`Error ${response.status}`);
      const data = await response.json();
      if (data.exito && data.clase) {
        setClaseDetectada(data.clase);
        return { exito: true, clase: data.clase, confianza: data.confianza ?? 0, referenciaId: data.referencia_id ?? null };
      }
      setClaseDetectada(null);
      return { exito: false, clase: data.clase ?? null, confianza: data.confianza ?? 0, referenciaId: data.referencia_id ?? null };
    } catch (error: any) {
      console.log('[YOLO] Error identificando:', error?.message ?? error);
      return { exito: false, clase: null, confianza: 0, referenciaId: null };
    } finally {
      setIdentificando(false);
    }
  }, []);

  const actualizarTracks = useCallback((detecciones: DeteccionRemota[]) => {
    const ahora = Date.now();
    // Los tracks confirmados se conservan durante toda la sesión: el total
    // no puede bajar sólo porque un objeto salió momentáneamente del encuadre.
    const tracks = [...tracksRef.current];
    const tracksUsados = new Set<number>();

    for (const deteccion of detecciones) {
      let mejorTrack: Track | undefined;
      let mejorPuntaje = -1;
      for (const track of tracks) {
        if (tracksUsados.has(track.id)) continue;
        if (ahora - track.ultimoVisto > TIEMPO_MAXIMO_PARA_ASOCIAR_MS) continue;
        const solapamiento = iou(track, deteccion);
        const distanciaCentro = distancia(track, deteccion);
        const distanciaPermitida = limiteDistancia(track, deteccion);
        if (solapamiento < IOU_MINIMO && distanciaCentro > distanciaPermitida) continue;
        const puntaje = solapamiento * 2 + (1 - distanciaCentro / distanciaPermitida);
        if (puntaje > mejorPuntaje) {
          mejorTrack = track;
          mejorPuntaje = puntaje;
        }
      }

      if (mejorTrack) {
        Object.assign(mejorTrack, deteccion, { ultimoVisto: ahora, vistas: mejorTrack.vistas + 1 });
        tracksUsados.add(mejorTrack.id);
      } else {
        tracks.push({ id: siguienteIdRef.current++, ...deteccion, vistas: 1, confirmado: false, ultimoVisto: ahora });
      }
    }

    for (const track of tracks) {
      if (!track.confirmado && track.vistas >= FRAMES_PARA_CONFIRMAR) {
        track.confirmado = true;
        console.log(`[Tracking] Objeto estable confirmado #${track.id}. Total acumulado: ${tracks.filter((item) => item.confirmado).length}`);
      }
    }

    tracksRef.current = tracks;
    const visibles = tracks
      // Un track antiguo sirve para asociar la siguiente caja, pero no puede
      // inflar el total mientras la cámara ya está mostrando otra posición.
      .filter((track) => track.confirmado && ahora - track.ultimoVisto <= TIEMPO_VISIBLE_EN_FRAME_MS)
      .map(({ vistas, confirmado, ultimoVisto, ...caja }) => caja);
    // El total conserva los objetos únicos confirmados durante la sesión;
    // las cajas visibles sólo funcionan como marcadores sobre la cámara.
    totalRef.current = tracks.filter((track) => track.confirmado).length;
    setCajasGuardadas(visibles);
    setTotalContado(totalRef.current);
  }, []);

  const confirmarObjeto = useCallback((claseYolo: string, nombreUsuario: string, imagenUri: string, referenciaId: string | null) => {
    setObjetoReferencia({ claseYolo, nombreUsuario, imagenUri, referenciaId });
    setClaseDetectada(null);
  }, []);

  const startDetection = useCallback((camRef: RefObject<Camera | null>) => {
    if (!camRef.current) {
      console.log('[Detección] No se puede iniciar: VisionCamera no está lista.');
      return;
    }

    cameraRef.current = camRef.current;
    isRunning.current = true;
    tracksRef.current = [];
    siguienteIdRef.current = 1;
    totalRef.current = 0;
    setCajasGuardadas([]);
    setTotalContado(0);
    setIsDetecting(true);
    console.log('[Detección] Sesión iniciada con tracking de IDs persistentes.');

    const tick = async () => {
      if (!isRunning.current || !cameraRef.current) return;
      try {
        const photo = await cameraRef.current.takePhoto({ quality: 0.5 } as any);
        const data = await enviarFoto(`file://${photo.path}`, objetoReferencia?.claseYolo ?? '', objetoReferencia?.referenciaId ?? null);
        if (!isRunning.current) return;
        const detecciones = Array.isArray(data.objetos) ? data.objetos as DeteccionRemota[] : [];
        console.log(`[Detección] Frame recibido: ${detecciones.length} objetos.`);
        actualizarTracks(detecciones);
      } catch (error: any) {
        console.log('[Detección] Error en frame:', error?.message ?? error);
      }
      if (isRunning.current) intervalRef.current = setTimeout(tick, INTERVAL_MS);
    };

    tick();
  }, [actualizarTracks, enviarFoto, objetoReferencia]);

  const contarFotoMasiva = useCallback(async (camRef: RefObject<Camera | null>) => {
    if (!camRef.current) {
      console.log('[Foto masiva] VisionCamera no está lista.');
      return 0;
    }
    setIsDetecting(true);
    setCajasGuardadas([]);
    setTotalContado(0);
    try {
      console.log('[Foto masiva] Capturando foto de alta resolución...');
      const photo = await camRef.current.takePhoto({ quality: 1 } as any);
      const data = await enviarFoto(
        `file://${photo.path}`,
        objetoReferencia?.claseYolo ?? '',
        objetoReferencia?.referenciaId ?? null,
        'foto_masiva',
      );
      const detecciones = Array.isArray(data.objetos) ? data.objetos as DeteccionRemota[] : [];
      const cajas = detecciones.map((deteccion, indice) => ({ ...deteccion, id: indice + 1 }));
      setCajasGuardadas(cajas);
      setTotalContado(cajas.length);
      totalRef.current = cajas.length;
      console.log(`[Foto masiva] Resultado final: ${cajas.length} objetos.`);
      return cajas.length;
    } catch (error: any) {
      console.log('[Foto masiva] Error:', error?.message ?? error);
      return 0;
    } finally {
      setIsDetecting(false);
    }
  }, [enviarFoto, objetoReferencia]);

  const stopDetection = useCallback(() => {
    isRunning.current = false;
    setIsDetecting(false);
    if (intervalRef.current) clearTimeout(intervalRef.current);
    intervalRef.current = null;
    console.log(`[Detección] Sesión detenida. Total final: ${totalRef.current}`);
    return totalRef.current;
  }, []);

  const limpiarReferencia = useCallback(() => {
    setObjetoReferencia(null);
    setCajasGuardadas([]);
    setTotalContado(0);
    setClaseDetectada(null);
  }, []);

  return {
    totalContado,
    cajasGuardadas,
    isDetecting,
    modelReady: true,
    objetoReferencia,
    identificando,
    claseDetectada,
    identificarFoto,
    confirmarObjeto,
    startDetection,
    contarFotoMasiva,
    stopDetection,
    limpiarReferencia,
  };
}
