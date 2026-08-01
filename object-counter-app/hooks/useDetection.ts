// hooks/useDetection.ts

import { useState, useCallback, useRef } from 'react';
import type { Camera } from 'react-native-vision-camera';

export type CountResult = {
  clase: string;
  cantidad: number;
  confianza: number;
};

// ⚠️ Reemplaza por la IP real de tu PC
const BACKEND_URL = 'http://192.168.1.7:8000/detect';

const INTERVAL_MS = 500;

export function useDetection() {
  const [counts, setCounts] = useState<CountResult[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [modelReady] = useState(true);

  const cameraRef = useRef<Camera | null>(null);
  const intervalRef = useRef<any>(null);
  const isRunning = useRef(false);

  const analyzePhoto = useCallback(async (uri: string) => {
    try {
      console.log('================================');
      console.log('📤 INICIANDO ENVÍO AL BACKEND');
      console.log('📷 URI:', uri);
      console.log('🌐 URL:', BACKEND_URL);

      const formData = new FormData();

      formData.append(
        'file',
        {
          uri,
          type: 'image/jpeg',
          name: 'photo.jpg',
        } as any
      );

      console.log('✅ FormData creado');

      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        body: formData,
      });

      console.log('📥 Response recibida');
      console.log('📥 Status:', response.status);
      console.log('📥 OK:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();

        console.log('❌ ERROR BACKEND');
        console.log(errorText);

        return;
      }

      const data = await response.json();

      console.log('✅ JSON recibido');
      //console.log(JSON.stringify(data, null, 2));

      if (data?.detecciones) {
        console.log(
          `🎯 Objetos detectados: ${data.detecciones.length}`
        );
      }

      setCounts(data.detecciones ?? []);

      console.log('✅ Estado actualizado');
      console.log('================================');
    } catch (err: any) {
      console.log('================================');
      console.log('❌ ERROR EN FETCH');
      console.log(err);
      console.log('Mensaje:', err?.message);
      console.log('================================');
    }
  }, []);

  const startDetection = useCallback(
    (camRef: React.RefObject<Camera | null>) => {
      console.log('================================');
      console.log('🚀 START DETECTION');
      console.log('================================');

      cameraRef.current = camRef.current;

      if (!cameraRef.current) {
        console.log('❌ cameraRef.current es NULL');
        return;
      }

      console.log('✅ Cámara encontrada');

      isRunning.current = true;

      setIsDetecting(true);
      setCounts([]);

      const tick = async () => {
        console.log('⏱ TICK');

        if (!isRunning.current) {
          console.log('⛔ Detección detenida');
          return;
        }

        if (!cameraRef.current) {
          console.log('❌ Cámara perdida');
          return;
        }

        try {
          console.log('📸 Tomando foto...');

          const photo = await cameraRef.current.takePhoto();

          console.log('✅ Foto capturada');
          console.log('📂 Path:', photo.path);

          const imageUri = `file://${photo.path}`;

          console.log('📷 URI generada:', imageUri);

          await analyzePhoto(imageUri);
        } catch (err: any) {
          console.log('❌ ERROR CAPTURANDO FOTO');
          console.log(err);
          console.log('Mensaje:', err?.message);
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
    [analyzePhoto]
  );

  const stopDetection = useCallback(() => {
    console.log('================================');
    console.log('🛑 STOP DETECTION');
    console.log('================================');

    isRunning.current = false;
    setIsDetecting(false);

    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
      console.log('✅ Timer eliminado');
    }
  }, []);

  return {
    counts,
    isDetecting,
    modelReady,
    startDetection,
    stopDetection,
  };
}