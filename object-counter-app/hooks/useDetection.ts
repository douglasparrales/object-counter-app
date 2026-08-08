import { useState, useCallback, useRef } from 'react';
import type { Camera } from 'react-native-vision-camera';

export type CajaGuardada = {
  id: number;
  clase: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
};

export type ObjetoReferencia = {
  claseYolo: string;
  nombreUsuario: string;
  imagenUri: string;
};

export type ResultadoIdentificacion = {
  exito: boolean;
  clase: string | null;
  confianza: number;
};

const BACKEND_URL = 'http://192.168.1.3:8000';
const INTERVAL_MS = 300;
const UMBRAL_DISTANCIA = 0.12;

export function useDetection() {
  const [cajasGuardadas, setCajasGuardadas] = useState<CajaGuardada[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [objetoReferencia, setObjetoReferencia] = useState<ObjetoReferencia | null>(null);
  const [identificando, setIdentificando] = useState(false);
  const [claseDetectada, setClaseDetectada] = useState<string | null>(null);

  const cameraRef = useRef<Camera | null>(null);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunning = useRef(false);

  const cajasRef = useRef<CajaGuardada[]>([]);
  cajasRef.current = cajasGuardadas;

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

  // 👉 Ahora recibe el nombre en ESPAÑOL que el usuario ya confirmó,
  // y se lo manda al backend como "prompt" para que YOLO-World tenga una pista clara.
  const identificarFoto = useCallback(async (uri: string, promptEs: string = ''): Promise<ResultadoIdentificacion> => {
    setIdentificando(true);
    try {
      const formData = new FormData();
      formData.append('file', { uri, type: 'image/jpeg', name: 'photo.jpg' } as any);

      const url = `${BACKEND_URL}/identify?prompt=${encodeURIComponent(promptEs.trim())}`;
      const response = await fetch(url, { method: 'POST', body: formData });

      if (!response.ok) throw new Error(`Error ${response.status}`);
      const data = await response.json();

      // El main.py nuevo devuelve: { exito, clase, traduccion, confianza }
      if (data.exito && data.clase) {
        setClaseDetectada(data.clase);
        return { exito: true, clase: data.clase, confianza: data.confianza ?? 0 };
      }

      setClaseDetectada(null);
      return { exito: false, clase: data.clase ?? null, confianza: data.confianza ?? 0 };
    } catch (err: any) {
      console.log('❌ Error identificando:', err?.message ?? err);
      return { exito: false, clase: null, confianza: 0 };
    } finally {
      setIdentificando(false);
    }
  }, []);

  const confirmarObjeto = useCallback((claseYolo: string, nombreUsuario: string, imagenUri: string) => {
    setObjetoReferencia({ claseYolo, nombreUsuario, imagenUri });
    setClaseDetectada(null);
  }, []);

  const startDetection = useCallback(async (camRef: React.RefObject<Camera | null>) => {
    cameraRef.current = camRef.current;
    isRunning.current = true;
    setIsDetecting(true);
    setCajasGuardadas([]);

    console.log('🚀 Detección con Cajas Persistentes Iniciada');

    const tick = async () => {
      if (!isRunning.current || !cameraRef.current) return;
      try {
        const photo = await cameraRef.current.takePhoto({ quality: 0.5 } as any);
        const uri = `file://${photo.path}`;
        const data = await enviarFoto(uri, objetoReferencia?.claseYolo ?? '');

        if (data.objetos && Array.isArray(data.objetos)) {
          setCajasGuardadas((cajasPrevias) => {
            const nuevasCajas = [...cajasPrevias];

            for (const det of data.objetos) {
              const yaExiste = nuevasCajas.some((caja) => {
                const dist = Math.sqrt(
                  Math.pow(det.cx - caja.cx, 2) + Math.pow(det.cy - caja.cy, 2)
                );
                return dist < UMBRAL_DISTANCIA;
              });

              if (!yaExiste) {
                nuevasCajas.push({
                  id: nuevasCajas.length + 1,
                  clase: det.clase,
                  cx: det.cx,
                  cy: det.cy,
                  w: det.w,
                  h: det.h,
                });
              }
            }
            return nuevasCajas;
          });
        }
      } catch (err: any) {
        if (err?.message?.includes('closed') || err?.message?.includes('native view tag')) {
          isRunning.current = false;
          return;
        }
        console.log('❌ Error en tick:', err?.message ?? err);
      }

      if (isRunning.current) {
        intervalRef.current = setTimeout(tick, INTERVAL_MS) as any;
      }
    };
    tick();
  }, [enviarFoto, objetoReferencia]);

  const stopDetection = useCallback(() => {
    isRunning.current = false;
    setIsDetecting(false);
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    console.log('🛑 Detección detenida | Total contado:', cajasRef.current.length);
  }, []);

  const limpiarReferencia = useCallback(() => {
    setObjetoReferencia(null);
    setCajasGuardadas([]);
    setClaseDetectada(null);
  }, []);

  return {
    totalContado: cajasGuardadas.length,
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