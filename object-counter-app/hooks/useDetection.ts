import { useState, useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { Camera } from 'react-native-vision-camera';
import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { SeleccionReferencia } from '../components/ReferenceSelector';
import {
  identificarReferencia,
  crearBarrido, cerrarBarrido, detectarBarrido,
} from '../services/realtimeDetection';

export type CajaGuardada = {
  confirmado?: boolean;
  id: number;
  clase: string;
  confianza: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  frame_width: number;
  frame_height: number;
};

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
const MAX_BOX_AGE_MS = 5000;
const BOX_VISIBLE_MS = 3000;
export function useDetection() {
  const [cajasGuardadas, setCajasGuardadas] = useState<CajaGuardada[]>([]);
  const [totalContado, setTotalContado] = useState(0);
  const [isDetecting, setIsDetecting] = useState(false);
  const [objetoReferencia, setObjetoReferencia] = useState<ObjetoReferencia | null>(null);
  const [identificando, setIdentificando] = useState(false);
  const [claseDetectada, setClaseDetectada] = useState<string | null>(null);
  const [estadoBarrido, setEstadoBarrido] = useState('');
  const generacion = useRef(0);
  const sesionRef = useRef<string | null>(null);
  const pendienteRef = useRef<Promise<void> | null>(null);
  const terminandoRef = useRef(false);

  const cameraRef = useRef<Camera | null>(null);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxesExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunning = useRef(false);
  const totalRef = useRef(0);

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
    const turno = ++generacion.current;
    terminandoRef.current = false;
    setEstadoBarrido('Preparando conteo · mantén los objetos quietos');
    totalRef.current = 0;
    if (boxesExpiryRef.current) clearTimeout(boxesExpiryRef.current);
    setCajasGuardadas([]);
    setTotalContado(0);
    setIsDetecting(true);
    console.log('[Detección] Sesión iniciada con tracking de IDs persistentes.');

    let secuencia = 0;
    const tick = async () => {
      if (!isRunning.current || turno !== generacion.current || !cameraRef.current) return;
      const archivos: string[] = [];
      try {
        if (!sesionRef.current) {
          if (!objetoReferencia?.referenciaId) throw new Error('Selecciona una referencia válida antes de contar.');
          const creada = await crearBarrido(objetoReferencia.referenciaId);
          if (!isRunning.current || turno !== generacion.current) { void cerrarBarrido(creada); return; }
          sesionRef.current = creada;
        }
        const capturedAt = Date.now();
        const photo = await cameraRef.current.takePhoto();
        const uri = `file://${photo.path}`;
        archivos.push(uri);
        const resized = await manipulateAsync(uri, [{ resize: photo.width > photo.height ? { width: 1280 } : { height: 1280 } }],
          { compress: 0.8, format: SaveFormat.JPEG });
        archivos.push(resized.uri);
        if (!isRunning.current || turno !== generacion.current) return;
        const resultado = await detectarBarrido(resized.uri, objetoReferencia?.claseYolo ?? '',
          objetoReferencia?.referenciaId ?? '', sesionRef.current!, secuencia++);
        if (!isRunning.current || turno !== generacion.current) return;
        totalRef.current = resultado.total;
        setTotalContado(resultado.total);
        // Keep the inventory, but never leave old positions over a live camera
        // while a slow request is pending or after its late response arrives.
        if (boxesExpiryRef.current) clearTimeout(boxesExpiryRef.current);
        const remaining = Math.min(BOX_VISIBLE_MS, MAX_BOX_AGE_MS - (Date.now() - capturedAt));
        setCajasGuardadas(remaining > 0 ? resultado.objetos : []);
        if (remaining > 0) {
          boxesExpiryRef.current = setTimeout(() => {
            if (isRunning.current && turno === generacion.current) setCajasGuardadas([]);
          }, remaining);
        }
        setEstadoBarrido(resultado.estado === 'SIN_COINCIDENCIA'
          ? 'Total conservado · vuelve a una zona ya vista y avanza con más solapamiento'
          : resultado.estado === 'INICIANDO' ? 'Mantén la cámara quieta para confirmar los primeros objetos'
          : 'Conteo activo · avanza despacio · verde: contado, amarillo: pendiente');
        console.log('[Barrido]', JSON.stringify({ total: resultado.total, estado: resultado.estado, visibles: resultado.objetos.length }));
      } catch (error: any) {
        // Detener desmonta la cámara mientras puede quedar una petición en
        // vuelo. Su cancelación es esperada y no debe mostrarse como error.
        if (isRunning.current && turno === generacion.current) {
          console.log('[Detección] Error en frame:', error?.message ?? error);
          setEstadoBarrido(`Total conservado · ${error?.message ?? 'No se pudo analizar la imagen'}`);
          setCajasGuardadas([]);
        }
      } finally {
        for (const uri of archivos) { try { new File(uri).delete(); } catch {} }
      }
      if (isRunning.current && turno === generacion.current && !terminandoRef.current)
        intervalRef.current = setTimeout(() => { pendienteRef.current = tick(); }, INTERVAL_MS);
    };

    pendienteRef.current = tick();
  }, [objetoReferencia]);

  const stopDetection = useCallback(() => {
    isRunning.current = false;
    generacion.current += 1;
    const sesion = sesionRef.current;
    sesionRef.current = null;
    if (sesion) void cerrarBarrido(sesion);
    setIsDetecting(false);
    if (intervalRef.current) clearTimeout(intervalRef.current);
    if (boxesExpiryRef.current) clearTimeout(boxesExpiryRef.current);
    setCajasGuardadas([]);
    intervalRef.current = null;
    console.log(`[Detección] Sesión detenida. Total final: ${totalRef.current}`);
    return totalRef.current;
  }, []);

  const finishDetection = useCallback(async () => {
    terminandoRef.current = true;
    if (intervalRef.current) clearTimeout(intervalRef.current);
    setEstadoBarrido('Terminando la última imagen…');
    await pendienteRef.current;
    return stopDetection();
  }, [stopDetection]);

  const limpiarReferencia = useCallback(() => {
    stopDetection();
    isRunning.current = false;
    if (intervalRef.current) clearTimeout(intervalRef.current);
    intervalRef.current = null;
    setObjetoReferencia(null);
    setCajasGuardadas([]);
    setTotalContado(0);
    setClaseDetectada(null);
  }, [stopDetection]);

  useEffect(() => () => {
    isRunning.current = false;
    generacion.current += 1;
    if (sesionRef.current) void cerrarBarrido(sesionRef.current);
    if (intervalRef.current) clearTimeout(intervalRef.current);
    if (boxesExpiryRef.current) clearTimeout(boxesExpiryRef.current);
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
    finishDetection,
    estadoBarrido,
    limpiarReferencia,
  };
}
