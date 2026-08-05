import { useState, useCallback, useRef } from 'react';
import type { Camera } from 'react-native-vision-camera';

export type Deteccion = {
  clase: string;
  confianza: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  track_id: number;
  ya_contado: boolean;
};

export type ObjetoReferencia = {
  claseYolo: string;
  nombreUsuario: string;
  imagenUri: string;
};

const BACKEND_URL = 'http://192.168.1.7:8000';
const INTERVAL_MS = 400;

export function useDetection() {
  const [totalContado, setTotalContado]               = useState(0);
  const [isDetecting, setIsDetecting]                 = useState(false);
  const [deteccionesActuales, setDeteccionesActuales] = useState<Deteccion[]>([]);
  const [objetoReferencia, setObjetoReferencia]       = useState<ObjetoReferencia | null>(null);
  const [identificando, setIdentificando]             = useState(false);
  const [claseDetectada, setClaseDetectada]           = useState<string | null>(null);

  const cameraRef   = useRef<Camera | null>(null);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunning   = useRef(false);

  const enviarFoto = useCallback(async (uri: string, claseFiltro = '') => {
    const formData = new FormData();
    formData.append('file', { uri, type: 'image/jpeg', name: 'photo.jpg' } as any);
    const url = claseFiltro
      ? `${BACKEND_URL}/detect?clase_filtro=${claseFiltro}`
      : `${BACKEND_URL}/detect`;
    const response = await fetch(url, { method: 'POST', body: formData });
    if (!response.ok) throw new Error(`Error ${response.status}`);
    return await response.json();
  }, []);

  const identificarFoto = useCallback(async (uri: string) => {
    setIdentificando(true);
    try {
      const formData = new FormData();
      formData.append('file', { uri, type: 'image/jpeg', name: 'photo.jpg' } as any);
      const response = await fetch(`${BACKEND_URL}/identify`, {
        method: 'POST', body: formData,
      });
      const data = await response.json();
      if (data.clase) { setClaseDetectada(data.clase); return data.clase; }
      return null;
    } catch (err: any) {
      console.log('❌ Error identificando:', err?.message ?? err);
      return null;
    } finally {
      setIdentificando(false);
    }
  }, []);

  const confirmarObjeto = useCallback((claseYolo: string, nombreUsuario: string, imagenUri: string) => {
    setObjetoReferencia({ claseYolo, nombreUsuario, imagenUri });
    setClaseDetectada(null);
  }, []);

  const resetBackend = useCallback(async () => {
    try {
      await fetch(`${BACKEND_URL}/reset`, { method: 'POST' });
      console.log('🔄 Sesión del backend reiniciada');
    } catch (err) {
      console.log('❌ Error reseteando backend');
    }
  }, []);

  const startDetection = useCallback(async (camRef: React.RefObject<Camera | null>) => {
    cameraRef.current = camRef.current;
    isRunning.current = true;
    setIsDetecting(true);
    setTotalContado(0);
    setDeteccionesActuales([]);

    // Resetear IDs del backend al iniciar nueva sesión
    await resetBackend();
    console.log('🚀 Detección iniciada');

    const tick = async () => {
      if (!isRunning.current || !cameraRef.current) return;
      try {
        const photo = await cameraRef.current.takePhoto({ quality: 0.4 } as any);
        const uri   = `file://${photo.path}`;
        const data  = await enviarFoto(uri, objetoReferencia?.claseYolo ?? '');

        setDeteccionesActuales(data.detecciones);
        setTotalContado(data.total_contado);
      } catch (err: any) {
        console.log('❌ Error en tick:', err?.message ?? err);
      }
      if (isRunning.current) {
        intervalRef.current = setTimeout(tick, INTERVAL_MS) as any;
      }
    };
    tick();
  }, [enviarFoto, objetoReferencia, resetBackend]);

  const stopDetection = useCallback(() => {
    isRunning.current = false;
    setIsDetecting(false);
    setDeteccionesActuales([]);
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    console.log('🛑 Detección detenida | Total:', totalContado);
  }, [totalContado]);

  const limpiarReferencia = useCallback(() => {
    setObjetoReferencia(null);
    setTotalContado(0);
    setClaseDetectada(null);
  }, []);

  return {
    totalContado, deteccionesActuales, isDetecting,
    modelReady: true, objetoReferencia, identificando,
    claseDetectada, identificarFoto, confirmarObjeto,
    startDetection, stopDetection, limpiarReferencia,
  };
}