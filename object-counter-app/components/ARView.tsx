import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import {
  ViroARSceneNavigator,
  ViroARScene,
  ViroAmbientLight,
  ViroNode,
  ViroText,
  ViroSphere,
  ViroMaterials,
} from '@reactvision/react-viro';

export interface Objeto3DAnclado {
  id: number;
  nombre: string;
  x: number;
  y: number;
  z: number;
}

// Se define `props?: any` como opcional para cumplir con la firma `() => JSX.Element`
function EscenaAR(props?: any) {
  const sceneNavigator = props?.sceneNavigator;
  const arSceneConfig = sceneNavigator?.viroAppProps;
  const objetosAnclados: Objeto3DAnclado[] = arSceneConfig?.objetosAnclados || [];
  const agregarAncla3D = arSceneConfig?.agregarAncla3D;

  const arSceneRef = useRef<any>(null);
  const DISTANCIA_MINIMA = 0.05; // 5 cm

  useEffect(() => {
    try {
      ViroMaterials.createMaterials({
        marcadorVerde: {
          diffuseColor: '#4ADE80',
          lightingModel: 'Blinn',
        },
      });
    } catch (e) {
      console.log('Error registrando materiales de Viro:', e);
    }
  }, []);

  const calcularDistancia3D = (
    p1: { x: number; y: number; z: number },
    p2: { x: number; y: number; z: number }
  ) => {
    return Math.sqrt(
      Math.pow(p1.x - p2.x, 2) +
      Math.pow(p1.y - p2.y, 2) +
      Math.pow(p1.z - p2.z, 2)
    );
  };

  const procesarDeteccion2DA3D = async (cx: number, cy: number) => {
    if (!arSceneRef.current) return;

    try {
      const hitTestResults: any = await arSceneRef.current.performARHitTestWithPoint(
        cx,
        cy
      );

      if (hitTestResults && hitTestResults.length > 0) {
        const punto3D = hitTestResults[0].transform.position;
        const [x, y, z] = punto3D;

        const existeCerca = objetosAnclados.some((obj) => {
          const dist = calcularDistancia3D({ x, y, z }, { x: obj.x, y: obj.y, z: obj.z });
          return dist < DISTANCIA_MINIMA;
        });

        if (!existeCerca && agregarAncla3D) {
          agregarAncla3D(x, y, z);
        }
      }
    } catch (e) {
      console.log('Error realizando Raycasting:', e);
    }
  };

  if (arSceneConfig) {
    arSceneConfig.procesarDeteccion2DA3D = procesarDeteccion2DA3D;
  }

  return (
    <ViroARScene ref={arSceneRef}>
      <ViroAmbientLight color="#ffffff" intensity={1000} />

      {objetosAnclados.map((obj) => (
        <ViroNode key={`ancla-${obj.id}`} position={[obj.x, obj.y, obj.z]}>
          <ViroSphere
            radius={0.015}
            position={[0, 0, 0]}
            materials={['marcadorVerde']}
          />
          <ViroText
            text={`#${obj.id} ${obj.nombre}`}
            scale={[0.1, 0.1, 0.1]}
            position={[0, 0.04, 0]}
            style={styles.arText}
          />
        </ViroNode>
      ))}
    </ViroARScene>
  );
}

export default function ARView({
  objetoReferencia,
  onDetener,
}: {
  objetoReferencia: { nombreUsuario: string; claseYolo: string } | null;
  onDetener: () => void;
}) {
  const [objetosAnclados, setObjetosAnclados] = useState<Objeto3DAnclado[]>([]);

  const agregarAncla3D = (x: number, y: number, z: number) => {
    setObjetosAnclados((prev) => {
      const nuevoId = prev.length + 1;
      const nuevoObj: Objeto3DAnclado = {
        id: nuevoId,
        nombre: objetoReferencia?.nombreUsuario || 'Objeto',
        x,
        y,
        z,
      };
      return [...prev, nuevoObj];
    });
  };

  return (
    <View style={styles.container}>
      <ViroARSceneNavigator
        autofocus={true}
        initialScene={{
          scene: EscenaAR,
        }}
        viroAppProps={{
          objetosAnclados,
          agregarAncla3D,
        }}
        style={styles.arView}
      />

      <View style={styles.hudContainer}>
        <View style={styles.badgeCount}>
          <Text style={styles.badgeLabel}>
            {objetoReferencia?.nombreUsuario ?? 'Objetos 3D'}
          </Text>
          <Text style={styles.badgeNum}>{objetosAnclados.length}</Text>
        </View>

        <View style={styles.actionsBar}>
          <TouchableOpacity style={styles.btnReset} onPress={() => setObjetosAnclados([])}>
            <Text style={styles.btnResetText}>🗑️ Reiniciar</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnStop} onPress={onDetener}>
            <Text style={styles.btnStopText}>🛑 Detener AR</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  arView: { flex: 1 },
  arText: {
    fontFamily: 'Arial',
    fontSize: 20,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  hudContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    bottom: 40,
    justifyContent: 'space-between',
    pointerEvents: 'box-none',
  },
  badgeCount: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: '#4ADE80',
  },
  badgeLabel: { color: '#aaa', fontSize: 12, fontWeight: '600' },
  badgeNum: { color: '#4ADE80', fontSize: 42, fontWeight: '800' },
  actionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between', // Correcto: justifyContent en lugar de justify
    alignItems: 'center',
  },
  btnReset: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnResetText: { color: '#fff', fontWeight: '600' },
  btnStop: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnStopText: { color: '#fff', fontWeight: '700' },
});