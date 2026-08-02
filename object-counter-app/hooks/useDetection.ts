import { useState, useCallback, useRef } from 'react';
import type { Camera } from 'react-native-vision-camera';

export type CountResult = {
  clase: string;
  cantidad: number;
  confianza: number;
};

export type ObjetoReferencia = {
  claseYolo: string;
  nombreUsuario: string;
  imagenUri: string;
};

const BACKEND_URL = 'http://192.168.1.7:8000';
const INTERVAL_MS = 600;

export function useDetection() {
  const [counts, setCounts] = useState<CountResult[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [objetoReferencia, setObjetoReferencia] =
    useState<ObjetoReferencia | null>(null);
  const [identificando, setIdentificando] = useState(false);
  const [claseDetectada, setClaseDetectada] =
    useState<string | null>(null);

  const cameraRef = useRef<Camera | null>(null);
  const intervalRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunning = useRef(false);

  const enviarFoto = useCallback(
    async (uri: string, claseFiltro = '') => {
      const formData = new FormData();

      formData.append(
        'file',
        {
          uri,
          type: 'image/jpeg',
          name: 'photo.jpg',
        } as any
      );

      const url = claseFiltro
        ? `${BACKEND_URL}/detect?clase_filtro=${claseFiltro}`
        : `${BACKEND_URL}/detect`;

      console.log(
        `📤 Detectando (${claseFiltro || 'todos'})`
      );

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      console.log(
        `📥 /detect status: ${response.status}`
      );

      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }

      return await response.json();
    },
    []
  );

  const identificarFoto = useCallback(
    async (uri: string) => {
      setIdentificando(true);

      try {
        console.log('📸 Identificando objeto...');

        const formData = new FormData();

        formData.append(
          'file',
          {
            uri,
            type: 'image/jpeg',
            name: 'photo.jpg',
          } as any
        );

        const response = await fetch(
          `${BACKEND_URL}/identify`,
          {
            method: 'POST',
            body: formData,
          }
        );

        console.log(
          `📥 /identify status: ${response.status}`
        );

        const data = await response.json();

        if (data.clase) {
          console.log(
            `✅ Detectado: ${data.clase}`
          );

          setClaseDetectada(data.clase);
          return data.clase;
        }

        console.log('⚠️ No se detectó ningún objeto');
        return null;
      } catch (err: any) {
        console.log(
          '❌ Error identificando:',
          err?.message ?? err
        );
        return null;
      } finally {
        setIdentificando(false);
      }
    },
    []
  );

  const confirmarObjeto = useCallback(
    (
      claseYolo: string,
      nombreUsuario: string,
      imagenUri: string
    ) => {
      console.log(
        `✅ Referencia guardada: ${nombreUsuario} (${claseYolo})`
      );

      setObjetoReferencia({
        claseYolo,
        nombreUsuario,
        imagenUri,
      });

      setClaseDetectada(null);
    },
    []
  );

  const startDetection = useCallback(
    (camRef: React.RefObject<Camera | null>) => {
      console.log('🚀 Iniciando conteo');

      cameraRef.current = camRef.current;
      isRunning.current = true;

      setIsDetecting(true);
      setCounts([]);

      const tick = async () => {
        if (!isRunning.current || !cameraRef.current) {
          return;
        }

        try {
          const photo = await cameraRef.current.takePhoto();

          const uri = `file://${photo.path}`;

          const claseFiltro =
            objetoReferencia?.claseYolo ?? '';

          const data = await enviarFoto(
            uri,
            claseFiltro
          );

          setCounts(data.detecciones);

          console.log(
            `✅ Resultados recibidos: ${
              data.detecciones?.length ?? 0
            }`
          );
        } catch (err: any) {
          console.log(
            '❌ Error en tick:',
            err?.message ?? err
          );
        }

        if (isRunning.current) {
          intervalRef.current = setTimeout(
            tick,
            INTERVAL_MS
          );
        }
      };

      tick();
    },
    [enviarFoto, objetoReferencia]
  );

  const stopDetection = useCallback(() => {
    console.log('🛑 Conteo detenido');

    isRunning.current = false;
    setIsDetecting(false);

    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const limpiarReferencia = useCallback(() => {
    console.log('🧹 Referencia eliminada');

    setObjetoReferencia(null);
    setCounts([]);
    setClaseDetectada(null);
  }, []);

  return {
    counts,
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