import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useRouter } from 'expo-router';
import AppMenu from '../components/AppMenu';
import SaveReportModal from '../components/SaveReportModal';
import { guardarReporte, persistirImagenReferencia } from '../db/client';
import { BACKEND_URL } from '../config/backend';

type Resultado = { total: number; resumen: Record<string, number> };

export default function StaticCountScreen() {
  const router = useRouter();
  const { hasPermission, requestPermission } = useCameraPermission();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const device = useCameraDevice(facing);
  const cameraRef = useRef<Camera>(null);
  const [procesando, setProcesando] = useState(false);
  const [foto, setFoto] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [reporteGuardado, setReporteGuardado] = useState(false);
  const gestoHistorial = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesto) => gesto.dx < -25 && Math.abs(gesto.dx) > Math.abs(gesto.dy),
    onPanResponderRelease: (_, gesto) => { if (gesto.dx < -80) router.push('/history'); },
  }), [router]);

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
      // La cámara debe seguir activa hasta terminar takePhoto. Cambiar este
      // estado antes cerraba el sensor y producía "Camera is closed".
      setProcesando(true);
      const formData = new FormData();
      formData.append('file', { uri, type: 'image/jpeg', name: 'conteo.jpg' } as any);
      console.log('[Foto directa] Enviando imagen a /count-image');
      const response = await fetch(`${BACKEND_URL}/count-image`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error(`Error ${response.status}`);
      const data = await response.json();
      setResultado({ total: data.total ?? 0, resumen: data.resumen ?? {} });
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
      <SaveReportModal
        visible={resultado !== null}
        total={resultado?.total ?? 0}
        etiqueta="Objetos"
        onClose={() => {
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
});
