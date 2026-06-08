// hooks/useDetection.ts
import { useState, useCallback, useRef } from 'react';

export type DetectionResult = {
  clase: string;
  cantidad: number;
  confianza: number;
};

export function useDetection() {
  const [counts, setCounts] = useState<DetectionResult[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // TODO Sprint 2: reemplazar esto con inferencia YOLO real
  const mockDetect = useCallback(() => {
    const mockClases = ['naranja', 'manzana', 'botella'];
    const resultados: DetectionResult[] = mockClases
      .slice(0, Math.floor(Math.random() * 3) + 1)
      .map(clase => ({
        clase,
        cantidad: Math.floor(Math.random() * 8) + 1,
        confianza: Math.random() * 0.3 + 0.7,
      }));
    setCounts(resultados);
  }, []);

  const startDetection = useCallback(() => {
    setIsDetecting(true);
    mockDetect();
    intervalRef.current = setInterval(mockDetect, 800);
  }, [mockDetect]);

  const stopDetection = useCallback(() => {
    setIsDetecting(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  return { counts, isDetecting, startDetection, stopDetection };
}