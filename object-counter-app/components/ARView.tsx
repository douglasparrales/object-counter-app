import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  ViroARScene,
  ViroARSceneNavigator,
  ViroAmbientLight,
  ViroMaterials,
  ViroNode,
  ViroObjectDetector,
  ViroSphere,
  ViroText,
  type ViroDetectedObject,
} from '@reactvision/react-viro';

export interface Objeto3DAnclado {
  id: number;
  nombre: string;
  x: number;
  y: number;
  z: number;
}

type Candidato = { x: number; y: number; z: number; vistas: number; ultimoVisto: number };

const DISTANCIA_ANCLA_METROS = 0.09;
const DISTANCIA_CANDIDATO_METROS = 0.12;
const VISTAS_PARA_CONTAR = 2;

function distancia3D(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function normalizarEtiqueta(valor: string) {
  return valor.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

function etiquetaCompatible(etiqueta: string, buscada: string) {
  const detectada = normalizarEtiqueta(etiqueta);
  const objetivo = normalizarEtiqueta(buscada);
  if (detectada === objetivo || detectada.includes(objetivo) || objetivo.includes(detectada)) return true;
  return objetivo === 'ballpoint pen' && (detectada === 'pen' || detectada.includes('ballpoint'));
}

function categoriasAR(clase: string) {
  const normalizada = normalizarEtiqueta(clase);
  if (normalizada === 'ballpoint pen') return ['ballpoint pen', 'pen'];
  if (normalizada === 'cell phone') return ['cell phone', 'phone', 'mobile phone'];
  return [normalizada];
}

function EscenaAR(props?: any) {
  const config = props?.sceneNavigator?.viroAppProps;
  const objetos: Objeto3DAnclado[] = config?.objetosAnclados ?? [];
  const candidatosRef = useRef<Candidato[]>([]);
  const escenaRef = useRef<any>(null);
  const ultimoAvisoSinPlanoRef = useRef(0);

  useEffect(() => {
    ViroMaterials.createMaterials({
      marcadorVerde: { diffuseColor: '#4ADE80', lightingModel: 'Blinn' },
    });
    console.log('[AR] Escena ARCore creada. Esperando plano horizontal.');
  }, []);

  const procesarDeteccion = useCallback(async (deteccion: ViroDetectedObject) => {
    if (!escenaRef.current || !etiquetaCompatible(deteccion.label, config?.claseYolo ?? '')) return;
    const caja = deteccion.screenBoundingBox;
    if (!caja) return;

    try {
      const hitTests = await escenaRef.current.performARHitTestWithPoint(
        caja.x + caja.width / 2,
        caja.y + caja.height / 2,
      );
      if (!hitTests?.length) {
        const ahora = Date.now();
        if (ahora - ultimoAvisoSinPlanoRef.current > 2000) {
          ultimoAvisoSinPlanoRef.current = ahora;
          console.log('[AR] Objeto detectado, pero su centro todavía no intersecta un plano horizontal.');
        }
        return;
      }

      const [x, y, z] = hitTests[0].transform.position;
      const punto = { x, y, z };
      if (objetos.some((objeto) => distancia3D(punto, objeto) < DISTANCIA_ANCLA_METROS)) return;

      const ahora = Date.now();
      const candidato = candidatosRef.current.find((item) => (
        ahora - item.ultimoVisto < 1800 && distancia3D(punto, item) < DISTANCIA_CANDIDATO_METROS
      ));

      if (!candidato) {
        candidatosRef.current = [
          ...candidatosRef.current.filter((item) => ahora - item.ultimoVisto < 1800),
          { ...punto, vistas: 1, ultimoVisto: ahora },
        ];
        return;
      }

      candidato.vistas += 1;
      candidato.ultimoVisto = ahora;
      if (candidato.vistas < VISTAS_PARA_CONTAR) return;

      candidatosRef.current = candidatosRef.current.filter((item) => item !== candidato);
      config?.agregarAncla3D?.(x, y, z);
    } catch (error) {
      console.log('[AR] Error en hit test:', error);
    }
  }, [config, objetos]);

  const recibirDetecciones = useCallback(({ detections }: { detections: ViroDetectedObject[] }) => {
    if (detections.length > 0) {
      console.log(`[AR] YOLOE dirigido encontró ${detections.length} candidato(s): ${detections.map((item) => `${item.label} ${item.confidence.toFixed(2)}`).join(', ')}`);
    }
    detections.forEach(procesarDeteccion);
  }, [procesarDeteccion]);

  useEffect(() => {
    config?.registrarDetector?.(recibirDetecciones);
    return () => config?.registrarDetector?.(null);
  }, [config, recibirDetecciones]);

  return (
    <ViroARScene ref={escenaRef} anchorDetectionTypes="planesHorizontal">
      <ViroAmbientLight color="#ffffff" intensity={1000} />
      {objetos.map((objeto) => (
        <ViroNode key={`ancla-${objeto.id}`} position={[objeto.x, objeto.y, objeto.z]}>
          <ViroSphere radius={0.015} materials={['marcadorVerde']} />
          <ViroText
            text={`#${objeto.id}`}
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
  objetoReferencia: { nombreUsuario: string; claseYolo: string };
  onDetener: (total: number) => void;
}) {
  const [objetosAnclados, setObjetosAnclados] = useState<Objeto3DAnclado[]>([]);
  const detectorHandlerRef = useRef<((evento: { detections: ViroDetectedObject[] }) => void) | null>(null);

  const registrarDetector = useCallback((handler: ((evento: { detections: ViroDetectedObject[] }) => void) | null) => {
    detectorHandlerRef.current = handler;
  }, []);

  const recibirDetecciones = useCallback((evento: { detections: ViroDetectedObject[] }) => {
    detectorHandlerRef.current?.(evento);
  }, []);

  const agregarAncla3D = useCallback((x: number, y: number, z: number) => {
    setObjetosAnclados((anteriores) => {
      if (anteriores.some((objeto) => distancia3D({ x, y, z }, objeto) < DISTANCIA_ANCLA_METROS)) return anteriores;
      const nuevo = { id: anteriores.length + 1, nombre: objetoReferencia.nombreUsuario, x, y, z };
      console.log(`[AR] Ancla confirmada #${nuevo.id} en (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}).`);
      return [...anteriores, nuevo];
    });
  }, [objetoReferencia.nombreUsuario]);

  return (
    <View style={styles.container}>
      <ViroARSceneNavigator
        autofocus
        initialScene={{ scene: EscenaAR }}
        viroAppProps={{ objetosAnclados, agregarAncla3D, registrarDetector, claseYolo: objetoReferencia.claseYolo }}
        style={styles.arView}
      />
      <ViroObjectDetector
        style={styles.detector}
        model="yoloe-counter-ar"
        mode="text"
        categories={categoriasAR(objetoReferencia.claseYolo)}
        confidenceThreshold={0.16}
        iouThreshold={0.45}
        maxFPS={4}
        maxDetections={12}
        projectToWorld={false}
        onDetection={recibirDetecciones}
        onReady={() => console.log('[AR] Detector YOLOE listo dentro de ARCore.')}
        onError={({ error }) => console.log('[AR] Error del detector:', error)}
      />
      <View style={styles.hud} pointerEvents="box-none">
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{objetoReferencia.nombreUsuario}</Text>
          <Text style={styles.badgeTotal}>{objetosAnclados.length}</Text>
          <Text style={styles.badgeHint}>Mueve la cámara lentamente sobre una superficie plana</Text>
        </View>
        <View style={styles.actions} pointerEvents="auto">
          <TouchableOpacity style={styles.reset} onPress={() => setObjetosAnclados([])}>
            <Text style={styles.resetText}>Reiniciar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stop} onPress={() => onDetener(objetosAnclados.length)}>
            <Text style={styles.stopText}>Detener</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  arView: { flex: 1 },
  detector: { position: 'absolute', width: 0, height: 0 },
  arText: { fontFamily: 'Arial', fontSize: 20, color: '#ffffff', fontWeight: 'bold' },
  hud: { position: 'absolute', top: 50, left: 20, right: 20, bottom: 40, justifyContent: 'space-between', pointerEvents: 'box-none' },
  badge: { backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 16, alignSelf: 'flex-start', borderWidth: 1.5, borderColor: '#4ADE80', maxWidth: 250 },
  badgeLabel: { color: '#aaa', fontSize: 12, fontWeight: '600' },
  badgeTotal: { color: '#4ADE80', fontSize: 42, fontWeight: '800' },
  badgeHint: { color: '#fff', fontSize: 11, marginTop: 2 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reset: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  resetText: { color: '#fff', fontWeight: '600' },
  stop: { backgroundColor: '#EF4444', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  stopText: { color: '#fff', fontWeight: '700' },
});
