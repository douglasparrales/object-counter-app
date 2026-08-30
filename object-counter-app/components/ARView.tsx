import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  ViroARScene,
  ViroARSceneNavigator,
  ViroARPlane,
  ViroAmbientLight,
  ViroMaterials,
  ViroNode,
  ViroObjectDetector,
  ViroSphere,
  ViroText,
  type ViroAnchor,
  type ViroDetectedObject,
} from '@reactvision/react-viro';

export interface Objeto3DAnclado {
  id: number;
  nombre: string;
  planoId: string;
  x: number;
  y: number;
  z: number;
}

type Candidato = {
  planoId: string;
  x: number;
  y: number;
  z: number;
  vistas: number;
  ultimoVisto: number;
  ultimoFrame: number;
};

const DISTANCIA_ANCLA_METROS = 0.16;
const DISTANCIA_CANDIDATO_METROS = 0.14;
const VISTAS_PARA_CONTAR = 3;

function distancia3D(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function mundoALocal(
  mundo: [number, number, number],
  posicion: [number, number, number],
  rotacion: [number, number, number],
): [number, number, number] {
  const rad = Math.PI / 180;
  const c1 = Math.cos(rotacion[0] * rad), s1 = Math.sin(rotacion[0] * rad);
  const c2 = Math.cos(rotacion[1] * rad), s2 = Math.sin(rotacion[1] * rad);
  const c3 = Math.cos(rotacion[2] * rad), s3 = Math.sin(rotacion[2] * rad);
  const dx = mundo[0] - posicion[0];
  const dy = mundo[1] - posicion[1];
  const dz = mundo[2] - posicion[2];
  return [
    c2 * c3 * dx + (s1 * s2 * c3 + c1 * s3) * dy + (-c1 * s2 * c3 + s1 * s3) * dz,
    -c2 * s3 * dx + (-s1 * s2 * s3 + c1 * c3) * dy + (c1 * s2 * s3 + s1 * c3) * dz,
    s2 * dx + (-s1 * c2) * dy + c1 * c2 * dz,
  ];
}

function normalizarEtiqueta(valor: string) {
  return valor.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

function etiquetaCompatible(etiqueta: string, buscada: string) {
  const detectada = normalizarEtiqueta(etiqueta);
  const objetivo = normalizarEtiqueta(buscada);
  if (detectada === objetivo || detectada.includes(objetivo) || objetivo.includes(detectada)) return true;
  if (objetivo === 'ballpoint pen') {
    // YOLOE móvil confunde de forma consistente los bolígrafos largos con
    // cuchillos. Se acepta esa confusión conocida como propuesta geométrica;
    // el anclaje temporal y espacial todavía debe confirmarla dos veces.
    return detectada === 'pen'
      || detectada === 'pencil'
      || detectada.includes('ballpoint')
      || detectada === 'knife';
  }
  return false;
}

function confianzaCompatible(deteccion: ViroDetectedObject, buscada: string) {
  const etiqueta = normalizarEtiqueta(deteccion.label);
  const objetivo = normalizarEtiqueta(buscada);
  // Las etiquetas sustitutas necesitan más evidencia que una coincidencia
  // semántica directa para no convertir manchas débiles en objetos.
  if (objetivo === 'ballpoint pen' && etiqueta === 'knife') return deteccion.confidence >= 0.15;
  return deteccion.confidence >= 0.10;
}

function EscenaAR(props?: any) {
  const config = props?.sceneNavigator?.viroAppProps;
  const objetos: Objeto3DAnclado[] = config?.objetosAnclados ?? [];
  const candidatosRef = useRef<Candidato[]>([]);
  const frameRef = useRef(0);
  const planosRef = useRef<Map<string, ViroAnchor>>(new Map());
  const planoActivoRef = useRef<string | null>(null);
  const retirosPlanoRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const escenaRef = useRef<any>(null);
  const ultimoAvisoSinPlanoRef = useRef(0);
  const ultimoLogCandidatosRef = useRef(0);

  useEffect(() => {
    ViroMaterials.createMaterials({
      marcadorVerde: { diffuseColor: '#4ADE80', lightingModel: 'Blinn' },
    });
    console.log('[AR] Escena ARCore creada. Esperando plano horizontal.');
  }, []);

  useEffect(() => {
    candidatosRef.current = [];
    frameRef.current = 0;
    planoActivoRef.current = null;
  }, [config?.reinicioId]);

  useEffect(() => () => {
    retirosPlanoRef.current.forEach(clearTimeout);
    retirosPlanoRef.current.clear();
  }, []);

  const registrarPlano = useCallback((ancla: ViroAnchor) => {
    if (ancla?.type !== 'plane' || !ancla.alignment?.includes('Horizontal')) return;
    const retiroPendiente = retirosPlanoRef.current.get(ancla.anchorId);
    if (retiroPendiente) {
      clearTimeout(retiroPendiente);
      retirosPlanoRef.current.delete(ancla.anchorId);
    }
    planosRef.current.set(ancla.anchorId, ancla);
  }, []);

  const eliminarPlano = useCallback((ancla?: ViroAnchor) => {
    if (!ancla?.anchorId) return;
    if (retirosPlanoRef.current.has(ancla.anchorId)) return;
    const retiro = setTimeout(() => {
      retirosPlanoRef.current.delete(ancla.anchorId);
      planosRef.current.delete(ancla.anchorId);
      if (planoActivoRef.current === ancla.anchorId) {
        planoActivoRef.current = null;
        candidatosRef.current = [];
        config?.invalidarPlano?.(ancla.anchorId);
        console.log('[AR] ARCore retiró definitivamente el plano activo; esperando una nueva superficie.');
      }
    }, 1500);
    retirosPlanoRef.current.set(ancla.anchorId, retiro);
  }, [config]);

  const localizarEnPlano = useCallback((punto: [number, number, number]) => {
    const opciones = [...planosRef.current.values()]
      .map((plano) => ({
        plano,
        local: mundoALocal(punto, plano.position, plano.rotation),
      }))
      .filter(({ plano, local }) => (
        Math.abs(local[1]) <= 0.12
        && Math.abs(local[0]) <= (plano.width ?? 0.5) / 2 + 0.08
        && Math.abs(local[2]) <= (plano.height ?? 0.5) / 2 + 0.08
      ))
      .sort((a, b) => Math.abs(a.local[1]) - Math.abs(b.local[1]));

    const activo = planoActivoRef.current;
    const elegida = activo
      ? opciones.find(({ plano }) => plano.anchorId === activo)
      : opciones[0];
    if (!elegida) return null;
    planoActivoRef.current ??= elegida.plano.anchorId;
    return {
      planoId: elegida.plano.anchorId,
      x: elegida.local[0],
      y: 0,
      z: elegida.local[2],
    };
  }, []);

  const procesarDeteccion = useCallback(async (deteccion: ViroDetectedObject, frameId: number) => {
    if (!escenaRef.current
      || !etiquetaCompatible(deteccion.label, config?.claseYolo ?? '')
      || !confianzaCompatible(deteccion, config?.claseYolo ?? '')) return;
    const caja = deteccion.screenBoundingBox;
    if (!caja) return;

    try {
      // Viro entrega screenBoundingBox en dp para poder dibujarlo con React
      // Native, pero el hit test de Android recibe coordenadas físicas px.
      const densidad = PixelRatio.get();
      const hitTests = await escenaRef.current.performARHitTestWithPoint(
        (caja.x + caja.width / 2) * densidad,
        (caja.y + caja.height / 2) * densidad,
      );
      const tiposPreferidos = [
        'ExistingPlaneUsingExtent',
        'DepthPoint',
        'EstimatedHorizontalPlane',
        'ExistingPlane',
      ];
      const impactoPlano = tiposPreferidos
        .map((tipo) => hitTests?.find((impacto: any) => impacto.type === tipo))
        .find(Boolean);
      if (!impactoPlano) {
        const ahora = Date.now();
        if (ahora - ultimoAvisoSinPlanoRef.current > 2000) {
          ultimoAvisoSinPlanoRef.current = ahora;
          console.log('[AR] Objeto detectado, pero su centro todavía no intersecta un plano horizontal.');
        }
        return;
      }

      const punto = localizarEnPlano(impactoPlano.transform.position);
      if (!punto) return;
      if (objetos.some((objeto) => objeto.planoId === punto.planoId && distancia3D(punto, objeto) < DISTANCIA_ANCLA_METROS)) return;

      const ahora = Date.now();
      const candidato = candidatosRef.current.find((item) => (
        item.ultimoFrame !== frameId
        && item.planoId === punto.planoId
        && ahora - item.ultimoVisto < 1800
        && distancia3D(punto, item) < DISTANCIA_CANDIDATO_METROS
      ));

      if (!candidato) {
        candidatosRef.current = [
          ...candidatosRef.current.filter((item) => ahora - item.ultimoVisto < 1800),
          { ...punto, vistas: 1, ultimoVisto: ahora, ultimoFrame: frameId },
        ];
        return;
      }

      candidato.vistas += 1;
      candidato.ultimoVisto = ahora;
      candidato.ultimoFrame = frameId;
      if (candidato.vistas < VISTAS_PARA_CONTAR) return;

      candidatosRef.current = candidatosRef.current.filter((item) => item !== candidato);
      config?.agregarAncla3D?.(punto.planoId, punto.x, punto.y, punto.z, impactoPlano.type);
    } catch (error) {
      console.log('[AR] Error en hit test:', error);
    }
  }, [config, localizarEnPlano, objetos]);

  const recibirDetecciones = useCallback(({ detections }: { detections: ViroDetectedObject[] }) => {
    const frameId = ++frameRef.current;
    const compatibles = detections.filter((item) => (
      etiquetaCompatible(item.label, config?.claseYolo ?? '')
      && confianzaCompatible(item, config?.claseYolo ?? '')
    ));
    const ahora = Date.now();
    if (compatibles.length > 0 && ahora - ultimoLogCandidatosRef.current >= 2000) {
      ultimoLogCandidatosRef.current = ahora;
      console.log(`[AR] ${compatibles.length} candidato(s) compatibles: ${compatibles.map((item) => `${item.label} ${item.confidence.toFixed(2)}`).join(', ')}`);
    }
    compatibles.forEach((deteccion) => procesarDeteccion(deteccion, frameId));
  }, [config?.claseYolo, procesarDeteccion]);

  useEffect(() => {
    config?.registrarDetector?.(recibirDetecciones);
    return () => config?.registrarDetector?.(null);
  }, [config, recibirDetecciones]);

  const objetosPorPlano = objetos.reduce<Map<string, Objeto3DAnclado[]>>((grupos, objeto) => {
    const grupo = grupos.get(objeto.planoId) ?? [];
    grupo.push(objeto);
    grupos.set(objeto.planoId, grupo);
    return grupos;
  }, new Map());

  return (
    <ViroARScene
      ref={escenaRef}
      anchorDetectionTypes="planesHorizontal"
      onAnchorFound={registrarPlano}
      onAnchorUpdated={registrarPlano}
      onAnchorRemoved={eliminarPlano}
    >
      <ViroAmbientLight color="#ffffff" intensity={1000} />
      {[...objetosPorPlano.entries()].map(([planoId, objetosDelPlano]) => (
        <ViroARPlane key={`plano-${planoId}`} anchorId={planoId}>
          {objetosDelPlano.map((objeto) => (
            <ViroNode key={`ancla-${objeto.id}`} position={[objeto.x, 0.015, objeto.z]}>
              <ViroSphere radius={0.015} materials={['marcadorVerde']} />
              <ViroText text={`#${objeto.id}`} scale={[0.1, 0.1, 0.1]} position={[0, 0.04, 0]} style={styles.arText} />
            </ViroNode>
          ))}
        </ViroARPlane>
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
  const [deteccionesVisibles, setDeteccionesVisibles] = useState<ViroDetectedObject[]>([]);
  const [reinicioId, setReinicioId] = useState(0);
  const detectorHandlerRef = useRef<((evento: { detections: ViroDetectedObject[] }) => void) | null>(null);
  const framesVaciosRef = useRef(0);

  const registrarDetector = useCallback((handler: ((evento: { detections: ViroDetectedObject[] }) => void) | null) => {
    detectorHandlerRef.current = handler;
  }, []);

  const recibirDetecciones = useCallback((evento: { detections: ViroDetectedObject[] }) => {
    const compatibles = evento.detections.filter((item) => (
      etiquetaCompatible(item.label, objetoReferencia.claseYolo)
      && confianzaCompatible(item, objetoReferencia.claseYolo)
      && item.screenBoundingBox
    ));
    setDeteccionesVisibles(compatibles);
    if (evento.detections.length === 0) {
      framesVaciosRef.current += 1;
      if (framesVaciosRef.current % 8 === 0) {
        console.log(`[AR] Detector activo: ${framesVaciosRef.current} frames procesados sin candidatos.`);
      }
    } else {
      framesVaciosRef.current = 0;
    }
    detectorHandlerRef.current?.(evento);
  }, [objetoReferencia.claseYolo]);

  const reiniciar = useCallback(() => {
    setObjetosAnclados([]);
    setDeteccionesVisibles([]);
    setReinicioId((valor) => valor + 1);
    console.log('[AR] Sesión espacial reiniciada por completo.');
  }, []);

  const invalidarPlano = useCallback((planoId: string) => {
    setObjetosAnclados((anteriores) => {
      if (!anteriores.some((objeto) => objeto.planoId === planoId)) return anteriores;
      console.log('[AR] ARCore reemplazó el plano del conteo; se descartan sus marcadores para evitar duplicados.');
      return anteriores.filter((objeto) => objeto.planoId !== planoId);
    });
  }, []);

  const agregarAncla3D = useCallback((planoId: string, x: number, y: number, z: number, tipoImpacto?: string) => {
    setObjetosAnclados((anteriores) => {
      if (anteriores.some((objeto) => objeto.planoId === planoId && distancia3D({ x, y, z }, objeto) < DISTANCIA_ANCLA_METROS)) return anteriores;
      const nuevo = { id: anteriores.length + 1, nombre: objetoReferencia.nombreUsuario, planoId, x, y, z };
      console.log(`[AR] Ancla local #${nuevo.id} [${tipoImpacto ?? 'sin tipo'}] plano=${planoId.slice(0, 8)} en (${x.toFixed(2)}, ${z.toFixed(2)}).`);
      return [...anteriores, nuevo];
    });
  }, [objetoReferencia.nombreUsuario]);

  return (
    <View style={styles.container}>
      <ViroARSceneNavigator
        autofocus
        initialScene={{ scene: EscenaAR }}
        viroAppProps={{ objetosAnclados, agregarAncla3D, invalidarPlano, registrarDetector, claseYolo: objetoReferencia.claseYolo, reinicioId }}
        style={styles.arView}
      />
      <ViroObjectDetector
        style={styles.detector}
        model="yoloe-counter-ar"
        mode="prompt-free"
        confidenceThreshold={0.05}
        iouThreshold={0.45}
        maxFPS={4}
        maxDetections={12}
        projectToWorld={false}
        onDetection={recibirDetecciones}
        onReady={() => console.log('[AR] Pipeline de cámara YOLOE iniciado dentro de ARCore.')}
        onError={({ error }) => console.log('[AR] Error del detector:', error)}
      />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {deteccionesVisibles.map((deteccion, indice) => {
          const caja = deteccion.screenBoundingBox!;
          return (
            <View key={`${indice}-${deteccion.label}`} style={[styles.detectionBox, {
              left: caja.x,
              top: caja.y,
              width: caja.width,
              height: caja.height,
            }]}>
              <Text style={styles.detectionLabel}>{deteccion.label} {Math.round(deteccion.confidence * 100)}%</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.hud} pointerEvents="box-none">
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{objetoReferencia.nombreUsuario}</Text>
          <Text style={styles.badgeTotal}>{objetosAnclados.length}</Text>
          <Text style={styles.badgeHint}>Mueve la cámara lentamente sobre una superficie plana</Text>
        </View>
        <View style={styles.actions} pointerEvents="auto">
          <TouchableOpacity style={styles.reset} onPress={reiniciar}>
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
  detectionBox: { position: 'absolute', borderWidth: 2, borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.08)' },
  detectionLabel: { position: 'absolute', top: -21, left: -2, color: '#111', backgroundColor: '#F59E0B', paddingHorizontal: 4, paddingVertical: 2, fontSize: 10, fontWeight: '800' },
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
