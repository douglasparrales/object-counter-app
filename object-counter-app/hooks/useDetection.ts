import { useState, useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { Camera } from 'react-native-vision-camera';
import type { SeleccionReferencia } from '../components/ReferenceSelector';
import {
  identificarReferencia,
  proveedorBackend,
  type DeteccionTiempoReal,
  type ProveedorDeteccionTiempoReal,
} from '../services/realtimeDetection';

export type CajaGuardada = {
  id: number;
  clase: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
};

type Track = CajaGuardada & { vistas: number; confirmado: boolean; ultimoVisto: number };
type DeteccionRemota = DeteccionTiempoReal;

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
const VENTANA_CONTEO_ESTABLE = 15;

function mediana(valores: number[]) {
  const ordenados = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(ordenados.length / 2);
  return ordenados.length % 2
    ? ordenados[mitad]
    : Math.round((ordenados[mitad - 1] + ordenados[mitad]) / 2);
}

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

export function useDetection(proveedor: ProveedorDeteccionTiempoReal = proveedorBackend) {
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
  const muestrasConteoRef = useRef<number[]>([]);

  const identificarFoto = useCallback(async (uri: string, promptEs: string, seleccion: SeleccionReferencia): Promise<ResultadoIdentificacion> => {
    setIdentificando(true);
    try {
      const data = await identificarReferencia(uri, promptEs, seleccion);
      if (data.exito && data.clase) {
        setClaseDetectada(data.clase);
        return data;
      }
      setClaseDetectada(null);
      return data;
    } catch (error: any) {
      console.log('[YOLO] Error identificando:', error?.message ?? error);
      return { exito: false, clase: null, confianza: 0, referenciaId: null };
    } finally {
      setIdentificando(false);
    }
  }, []);

  const actualizarTracks = useCallback((detecciones: DeteccionRemota[]) => {
    const ahora = Date.now();
    // En 2D no existe información espacial suficiente para reconocer que un
    // objeto que reaparece tras mover la cámara es el mismo objeto físico.
    // Conservamos tracks recientes para estabilizar cajas, no para acumularlos.
    const tracks = tracksRef.current.filter(
      (track) => ahora - track.ultimoVisto <= TIEMPO_MAXIMO_PARA_ASOCIAR_MS,
    );
    const tracksUsados = new Set<number>();
    const tracksVistosAhora = new Set<number>();

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
        tracksVistosAhora.add(mejorTrack.id);
      } else {
        const nuevoTrack: Track = { id: siguienteIdRef.current++, ...deteccion, vistas: 1, confirmado: false, ultimoVisto: ahora };
        tracks.push(nuevoTrack);
        tracksVistosAhora.add(nuevoTrack.id);
      }
    }

    for (const track of tracks) {
      if (!track.confirmado && track.vistas >= FRAMES_PARA_CONFIRMAR) {
        track.confirmado = true;
        console.log(`[Tracking] Objeto estable confirmado #${track.id}.`);
      }
    }

    tracksRef.current = tracks;
    const visibles = tracks
      .filter((track) => track.confirmado && tracksVistosAhora.has(track.id))
      .map(({ vistas, confirmado, ultimoVisto, ...caja }) => caja);
    // Resultado 2D: mediana temporal de detecciones positivas. Un objeto que
    // se pierde unos frames o una mancha ocasional no altera el resultado.
    if (detecciones.length > 0) {
      const totalAnterior = totalRef.current;
      muestrasConteoRef.current.push(detecciones.length);
      if (muestrasConteoRef.current.length > VENTANA_CONTEO_ESTABLE) {
        muestrasConteoRef.current.shift();
      }
      totalRef.current = mediana(muestrasConteoRef.current);
      if (totalRef.current !== totalAnterior) {
        console.log(`[Conteo 2D] Estimación estable: ${totalRef.current} (${muestrasConteoRef.current.length} muestras).`);
      }
    }
    setCajasGuardadas(visibles);
    setTotalContado(totalRef.current);
  }, []);

  const confirmarObjeto = useCallback((claseYolo: string, nombreUsuario: string, imagenUri: string, referenciaId: string | null) => {
    setObjetoReferencia({ claseYolo, nombreUsuario, imagenUri, referenciaId });
    setClaseDetectada(null);
  }, []);

  const startDetection = useCallback((camRef: RefObject<Camera | null>) => {
    if (isRunning.current) return;
    if (!camRef.current) {
      console.log('[Detección] No se puede iniciar: VisionCamera no está lista.');
      return;
    }

    cameraRef.current = camRef.current;
    isRunning.current = true;
    tracksRef.current = [];
    siguienteIdRef.current = 1;
    totalRef.current = 0;
    muestrasConteoRef.current = [];
    setCajasGuardadas([]);
    setTotalContado(0);
    setIsDetecting(true);
    console.log('[Detección] Sesión iniciada con tracking de IDs persistentes.');

    const tick = async () => {
      if (!isRunning.current || !cameraRef.current) return;
      try {
        const photo = await cameraRef.current.takePhoto({ quality: 0.5 } as any);
        const detecciones = await proveedor.detectar(
          `file://${photo.path}`,
          objetoReferencia?.claseYolo ?? '',
          objetoReferencia?.referenciaId ?? null,
        );
        if (!isRunning.current) return;
        console.log(`[Detección] Frame recibido: ${detecciones.length} objetos.`);
        actualizarTracks(detecciones);
      } catch (error: any) {
        console.log('[Detección] Error en frame:', error?.message ?? error);
      }
      if (isRunning.current) intervalRef.current = setTimeout(tick, INTERVAL_MS);
    };

    tick();
  }, [actualizarTracks, objetoReferencia, proveedor]);

  const stopDetection = useCallback(() => {
    isRunning.current = false;
    setIsDetecting(false);
    if (intervalRef.current) clearTimeout(intervalRef.current);
    intervalRef.current = null;
    console.log(`[Detección] Sesión detenida. Total final: ${totalRef.current}`);
    return totalRef.current;
  }, []);

  const limpiarReferencia = useCallback(() => {
    isRunning.current = false;
    if (intervalRef.current) clearTimeout(intervalRef.current);
    intervalRef.current = null;
    tracksRef.current = [];
    muestrasConteoRef.current = [];
    setObjetoReferencia(null);
    setCajasGuardadas([]);
    setTotalContado(0);
    setClaseDetectada(null);
  }, []);

  useEffect(() => () => {
    isRunning.current = false;
    if (intervalRef.current) clearTimeout(intervalRef.current);
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
    stopDetection,
    limpiarReferencia,
  };
}
