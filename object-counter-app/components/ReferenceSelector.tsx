import { useMemo, useRef, useState } from 'react';
import {
  Image,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export type SeleccionReferencia = { x: number; y: number; w: number; h: number };

type Punto = { x: number; y: number };

type Props = {
  uri: string;
  seleccion: SeleccionReferencia | null;
  onSeleccion: (seleccion: SeleccionReferencia | null) => void;
};

export default function ReferenceSelector({ uri, seleccion, onSeleccion }: Props) {
  const [tamano, setTamano] = useState({ width: 1, height: 1 });
  const inicio = useRef<Punto | null>(null);

  const limitar = (valor: number, maximo: number) => Math.max(0, Math.min(maximo, valor));

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evento) => {
      const punto = {
        x: limitar(evento.nativeEvent.locationX, tamano.width),
        y: limitar(evento.nativeEvent.locationY, tamano.height),
      };
      inicio.current = punto;
      onSeleccion({ x: punto.x / tamano.width, y: punto.y / tamano.height, w: 0, h: 0 });
    },
    onPanResponderMove: (evento) => {
      if (!inicio.current) return;
      const fin = {
        x: limitar(evento.nativeEvent.locationX, tamano.width),
        y: limitar(evento.nativeEvent.locationY, tamano.height),
      };
      const x = Math.min(inicio.current.x, fin.x);
      const y = Math.min(inicio.current.y, fin.y);
      onSeleccion({
        x: x / tamano.width,
        y: y / tamano.height,
        w: Math.abs(fin.x - inicio.current.x) / tamano.width,
        h: Math.abs(fin.y - inicio.current.y) / tamano.height,
      });
    },
    onPanResponderRelease: () => { inicio.current = null; },
    onPanResponderTerminate: () => { inicio.current = null; },
  }), [onSeleccion, tamano.height, tamano.width]);

  const medir = (evento: LayoutChangeEvent) => setTamano(evento.nativeEvent.layout);

  return (
    <View style={styles.marco} onLayout={medir} {...panResponder.panHandlers}>
      <Image source={{ uri }} style={styles.imagen} resizeMode="stretch" />
      {seleccion && seleccion.w > 0 && seleccion.h > 0 && (
        <View pointerEvents="none" style={[styles.seleccion, {
          left: `${seleccion.x * 100}%`,
          top: `${seleccion.y * 100}%`,
          width: `${seleccion.w * 100}%`,
          height: `${seleccion.h * 100}%`,
        }]}>
          <Text style={styles.etiqueta}>Ejemplar</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  marco: { width: '100%', aspectRatio: 3 / 4, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: '#4ADE80' },
  imagen: { ...StyleSheet.absoluteFillObject },
  seleccion: { position: 'absolute', borderWidth: 3, borderColor: '#4ADE80', backgroundColor: 'rgba(74,222,128,0.12)' },
  etiqueta: { position: 'absolute', top: -1, left: -1, color: '#10151c', backgroundColor: '#4ADE80', fontSize: 11, fontWeight: '800', paddingHorizontal: 5, paddingVertical: 2 },
});
