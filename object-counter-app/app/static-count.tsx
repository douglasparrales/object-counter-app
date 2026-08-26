import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, PanResponder, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useRouter } from 'expo-router';
import AppMenu from '../components/AppMenu';
import SaveReportModal from '../components/SaveReportModal';
import { guardarReporte, persistirImagenReferencia } from '../db/client';
import { contarFotoEstatica, type SeleccionVisual } from '../services/staticCountApi';

type Resultado = {
  total: number;
  resumen: Record<string, number>;
  imagenAnotada: string | null;
  imagenMosaicos: string | null;
};

export default function StaticCountScreen() {
  const router = useRouter();
  const { hasPermission, requestPermission } = useCameraPermission();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const device = useCameraDevice(facing);
  const cameraRef = useRef<Camera>(null);
  const [procesando, setProcesando] = useState(false);
  const [foto, setFoto] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [objetivo, setObjetivo] = useState('');
  const [seleccion, setSeleccion] = useState<SeleccionVisual | null>(null);
  const inicioSeleccionRef = useRef({ x: 0, y: 0 });
  const tamanoSelectorRef = useRef({ width: 1, height: 1 });
  const [vistaAuditoria, setVistaAuditoria] = useState<'detecciones' | 'mosaicos'>('detecciones');
  const [mostrarGuardado, setMostrarGuardado] = useState(false);
  const [reporteGuardado, setReporteGuardado] = useState(false);
  const gestoHistorial = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesto) => gesto.dx < -25 && Math.abs(gesto.dx) > Math.abs(gesto.dy),
    onPanResponderRelease: (_, gesto) => { if (gesto.dx < -80) router.push('/history'); },
  }), [router]);
  const gestoSeleccion = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evento) => {
      const { width, height } = tamanoSelectorRef.current;
      const x = Math.max(0, Math.min(1, evento.nativeEvent.locationX / width));
      const y = Math.max(0, Math.min(1, evento.nativeEvent.locationY / height));
      inicioSeleccionRef.current = { x, y };
      setSeleccion({ x, y, w: 0, h: 0 });
    },
    onPanResponderMove: (evento) => {
      const { width, height } = tamanoSelectorRef.current;
      const actualX = Math.max(0, Math.min(1, evento.nativeEvent.locationX / width));
      const actualY = Math.max(0, Math.min(1, evento.nativeEvent.locationY / height));
      const inicio = inicioSeleccionRef.current;
      setSeleccion({
        x: Math.min(inicio.x, actualX),
        y: Math.min(inicio.y, actualY),
        w: Math.abs(actualX - inicio.x),
        h: Math.abs(actualY - inicio.y),
      });
    },
  }), []);

  const tomarYContar = async () => {
    if (procesando) return;
    if (foto) {
      setFoto(null);
      setResultado(null);
      return;
    }
    if (!cameraRef.current) return;
    setResultado(null);
    setReporteGuardado(false);
    try {
      const photo = await cameraRef.current.takePhoto({ quality: 1 } as any);
      const uri = `file://${photo.path}`;
      setFoto(uri);
      setSeleccion(null);
      setObjetivo('');
    } catch (error: any) {
      console.log('[Foto directa] Error capturando:', error?.message ?? error);
      Alert.alert('Error', 'No se pudo tomar la fotografía.');
    }
  };

  const analizarSeleccion = async () => {
    if (!foto || procesando) return;
    if (!objetivo.trim()) {
      Alert.alert('Falta el nombre', 'Escribe qué objeto deseas contar, por ejemplo: esfero, mouse o teléfono.');
      return;
    }
    if (!seleccion || seleccion.w < 0.02 || seleccion.h < 0.02) {
      Alert.alert('Falta seleccionar', 'Dibuja un rectángulo ajustado alrededor de un solo objeto.');
      return;
    }
    setProcesando(true);
    try {
      const data = await contarFotoEstatica(foto, objetivo, seleccion);
      setResultado({
        total: data.total,
        resumen: data.resumen,
        imagenAnotada: data.imagenAnotada,
        imagenMosaicos: data.imagenMosaicos,
      });
      setVistaAuditoria('detecciones');
      console.log('[Foto directa] Resultado:', data);
    } catch (error: any) {
      console.log('[Foto directa] Error:', error?.message ?? error);
      Alert.alert('Error', 'No se pudo analizar la foto. Revisa que el backend esté accesible.');
    } finally {
      setProcesando(false);
    }
  };

  const guardarResultado = async (ubicacion: string) => {
    if (!foto || !resultado) return;
    try {
      const imagenUri = await persistirImagenReferencia(foto);
      await guardarReporte({
        fechaInicio: new Date().toISOString(), fechaFin: new Date().toISOString(), imagenUri,
        nombreObjeto: 'Conteo desde foto', claseYolo: Object.keys(resultado.resumen).join(', '),
        ubicacion, modoConteo: 'foto_estatica', totalObjetos: resultado.total,
      });
    } catch (error) {
      console.log('[Foto directa] Error guardando:', error);
      Alert.alert('Error', 'No se pudo guardar el reporte.');
      throw error;
    }
  };

  if (!hasPermission) return <View style={styles.center}><Text style={styles.text}>Se requiere permiso de cámara.</Text><TouchableOpacity style={styles.action} onPress={requestPermission}><Text style={styles.actionText}>Dar permiso</Text></TouchableOpacity></View>;
  if (!device) return <View style={styles.center}><Text style={styles.text}>No se encontró cámara.</Text></View>;

  return (
    <View style={styles.container} {...gestoHistorial.panHandlers}>
      {foto ? <Image source={{ uri: foto }} style={styles.camera} /> : <Camera ref={cameraRef} style={styles.camera} device={device} isActive={!procesando} photo />}
      <View style={styles.menu}><AppMenu /></View>
      <View style={styles.top}><Text style={styles.title}>Conteo desde foto</Text><Text style={styles.hint}>Encuadra todos los objetos y toma una sola foto.</Text></View>
      <View style={styles.bottom}>
        <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}><Text style={styles.navBackText}>‹</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => setFacing((actual) => actual === 'back' ? 'front' : 'back')}><Text style={styles.navText}>Voltear</Text></TouchableOpacity>
        {procesando ? <View style={styles.capture}><ActivityIndicator color="#10151c" /></View> : <TouchableOpacity style={styles.capture} onPress={tomarYContar}><Text style={styles.captureText}>Contar</Text></TouchableOpacity>}
      </View>
      {reporteGuardado && <View style={styles.historyHint}><Text style={styles.historyHintText}>Desliza hacia la izquierda para ver los reportes</Text></View>}
      <Modal visible={foto !== null && resultado === null} animationType="slide" onRequestClose={() => setFoto(null)}>
        <View style={styles.selectorContainer}>
          <View style={styles.selectorHeader}>
            <Text style={styles.selectorTitle}>Selecciona un ejemplar</Text>
            <Text style={styles.selectorHint}>Escribe su nombre y arrastra un rectángulo ajustado alrededor de uno.</Text>
          </View>
          <View
            style={styles.selectorImageContainer}
            onLayout={(evento) => { tamanoSelectorRef.current = evento.nativeEvent.layout; }}
          >
            <Image source={{ uri: foto ?? '' }} style={StyleSheet.absoluteFill} resizeMode="stretch" />
            <View style={StyleSheet.absoluteFill} {...gestoSeleccion.panHandlers}>
              {seleccion && <View pointerEvents="none" style={[styles.selectionBox, {
                left: `${seleccion.x * 100}%` as `${number}%`, top: `${seleccion.y * 100}%` as `${number}%`,
                width: `${seleccion.w * 100}%` as `${number}%`, height: `${seleccion.h * 100}%` as `${number}%`,
              }]} />}
            </View>
          </View>
          <TextInput
            style={styles.objectInput}
            value={objetivo}
            onChangeText={setObjetivo}
            placeholder="Ej.: esfero, mouse, teclado, teléfono..."
            placeholderTextColor="#7f8b96"
            autoCapitalize="none"
          />
          <View style={styles.selectorActions}>
            <TouchableOpacity style={styles.selectorCancel} onPress={() => { setFoto(null); setSeleccion(null); }}><Text style={styles.selectorCancelText}>Repetir foto</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.selectorAnalyze, procesando && styles.selectorDisabled]} onPress={analizarSeleccion} disabled={procesando}>
              {procesando ? <ActivityIndicator color="#10151c" /> : <Text style={styles.selectorAnalyzeText}>Analizar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={resultado !== null && !mostrarGuardado} animationType="slide" onRequestClose={() => { setResultado(null); setFoto(null); }}>
        <View style={styles.auditContainer}>
          <View style={styles.auditHeader}>
            <View><Text style={styles.auditTitle}>Revisión del conteo</Text><Text style={styles.auditTotal}>{resultado?.total ?? 0} candidatos</Text></View>
            <TouchableOpacity style={styles.auditClose} onPress={() => { setResultado(null); setFoto(null); }}><Text style={styles.auditCloseText}>×</Text></TouchableOpacity>
          </View>
          <Image
            source={{ uri: vistaAuditoria === 'mosaicos' ? (resultado?.imagenMosaicos ?? foto ?? '') : (resultado?.imagenAnotada ?? foto ?? '') }}
            style={styles.auditImage}
            resizeMode="contain"
          />
          <View style={styles.auditTabs}>
            <TouchableOpacity style={[styles.auditTab, vistaAuditoria === 'detecciones' && styles.auditTabActive]} onPress={() => setVistaAuditoria('detecciones')}><Text style={styles.auditTabText}>Detecciones</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.auditTab, vistaAuditoria === 'mosaicos' && styles.auditTabActive]} onPress={() => setVistaAuditoria('mosaicos')}><Text style={styles.auditTabText}>Mosaicos</Text></TouchableOpacity>
          </View>
          <Text style={styles.auditHint}>{vistaAuditoria === 'detecciones' ? 'Cada caja numerada forma parte del total.' : 'Las líneas celestes muestran los recortes y su solapamiento.'}</Text>
          <View style={styles.auditActions}>
            <TouchableOpacity style={styles.auditRetake} onPress={() => { setResultado(null); setFoto(null); }}><Text style={styles.auditRetakeText}>Repetir foto</Text></TouchableOpacity>
            <TouchableOpacity style={styles.auditContinue} onPress={() => setMostrarGuardado(true)}><Text style={styles.auditContinueText}>Continuar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
      <SaveReportModal
        visible={resultado !== null && mostrarGuardado}
        total={resultado?.total ?? 0}
        etiqueta="Objetos"
        onClose={() => {
          setMostrarGuardado(false);
          setResultado(null);
          setFoto(null);
        }}
        onSave={guardarResultado}
        onSaved={() => setReporteGuardado(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' }, camera: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#10151c', padding: 24 },
  text: { color: '#fff', fontSize: 16 }, action: { backgroundColor: '#4ADE80', marginTop: 18, borderRadius: 12, padding: 13 }, actionText: { color: '#10151c', fontWeight: '800' },
  menu: { position: 'absolute', top: 42, left: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 22 },
  top: { position: 'absolute', top: 98, left: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 12, padding: 12 }, title: { color: '#fff', fontSize: 18, fontWeight: '800' }, hint: { color: '#c0c8d0', marginTop: 4, fontSize: 13 },
  historyHint: { position: 'absolute', bottom: 110, left: 24, right: 24, alignItems: 'center' }, historyHintText: { color: '#fff', fontSize: 12, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
  bottom: { position: 'absolute', bottom: 50, left: 20, right: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14 }, navBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 24, minWidth: 46, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center', alignItems: 'center' }, navBackText: { color: '#fff', fontSize: 30, lineHeight: 20 }, navText: { color: '#fff', fontSize: 13 }, capture: { width: 76, height: 76, backgroundColor: '#4ADE80', borderRadius: 38, justifyContent: 'center', alignItems: 'center' }, captureText: { color: '#10151c', fontWeight: '700', fontSize: 13 },
  auditContainer: { flex: 1, backgroundColor: '#0b1016', paddingTop: 48, paddingHorizontal: 16, paddingBottom: 24 },
  auditHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  auditTitle: { color: '#fff', fontSize: 21, fontWeight: '800' }, auditTotal: { color: '#4ADE80', fontSize: 15, marginTop: 2, fontWeight: '700' },
  auditClose: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#242c35', alignItems: 'center', justifyContent: 'center' }, auditCloseText: { color: '#fff', fontSize: 30, lineHeight: 32 },
  auditImage: { flex: 1, width: '100%', backgroundColor: '#000', borderRadius: 14 },
  auditTabs: { flexDirection: 'row', backgroundColor: '#1b232c', borderRadius: 12, padding: 4, marginTop: 14 },
  auditTab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 9 }, auditTabActive: { backgroundColor: '#34414d' }, auditTabText: { color: '#fff', fontWeight: '700' },
  auditHint: { color: '#aab4bf', fontSize: 12, textAlign: 'center', marginTop: 9 },
  auditActions: { flexDirection: 'row', gap: 12, marginTop: 14 },
  auditRetake: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: '#29323c' }, auditRetakeText: { color: '#fff', fontWeight: '700' },
  auditContinue: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: '#4ADE80' }, auditContinueText: { color: '#10151c', fontWeight: '800' },
  selectorContainer: { flex: 1, backgroundColor: '#0b1016', paddingTop: 48, paddingHorizontal: 16, paddingBottom: 24 },
  selectorHeader: { marginBottom: 12 }, selectorTitle: { color: '#fff', fontSize: 22, fontWeight: '800' }, selectorHint: { color: '#aab4bf', fontSize: 13, marginTop: 5 },
  selectorImageContainer: { flex: 1, overflow: 'hidden', borderRadius: 14, backgroundColor: '#000', borderWidth: 1, borderColor: '#303b46' },
  selectionBox: { position: 'absolute', borderWidth: 3, borderColor: '#4ADE80', backgroundColor: 'rgba(74,222,128,0.14)' },
  objectInput: { backgroundColor: '#19212a', color: '#fff', borderWidth: 1.5, borderColor: '#4ADE80', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 14, fontSize: 15 },
  selectorActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  selectorCancel: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: '#29323c' }, selectorCancelText: { color: '#fff', fontWeight: '700' },
  selectorAnalyze: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: '#4ADE80' }, selectorAnalyzeText: { color: '#10151c', fontWeight: '800' }, selectorDisabled: { opacity: 0.65 },
});
