import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useRouter } from 'expo-router';
import AppMenu from '../components/AppMenu';

const BACKEND_URL = 'http://192.168.1.3:8000';

type Resultado = { total: number; resumen: Record<string, number> };

export default function StaticCountScreen() {
  const router = useRouter();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const cameraRef = useRef<Camera>(null);
  const [procesando, setProcesando] = useState(false);
  const [foto, setFoto] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const tomarYContar = async () => {
    if (procesando) return;
    if (foto) {
      setFoto(null);
      setResultado(null);
      return;
    }
    if (!cameraRef.current) return;
    setProcesando(true);
    setResultado(null);
    try {
      const photo = await cameraRef.current.takePhoto({ quality: 1 } as any);
      const uri = `file://${photo.path}`;
      setFoto(uri);
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

  if (!hasPermission) return <View style={styles.center}><Text style={styles.text}>Se requiere permiso de cámara.</Text><TouchableOpacity style={styles.action} onPress={requestPermission}><Text style={styles.actionText}>Dar permiso</Text></TouchableOpacity></View>;
  if (!device) return <View style={styles.center}><Text style={styles.text}>No se encontró cámara.</Text></View>;

  return (
    <View style={styles.container}>
      {foto ? <Image source={{ uri: foto }} style={styles.camera} /> : <Camera ref={cameraRef} style={styles.camera} device={device} isActive={!procesando} photo />}
      <View style={styles.menu}><AppMenu /></View>
      <View style={styles.top}><Text style={styles.title}>Conteo desde foto</Text><Text style={styles.hint}>Encuadra todos los objetos y toma una sola foto.</Text></View>
      {resultado && (
        <View style={styles.result}>
          <Text style={styles.total}>{resultado.total}</Text>
          <Text style={styles.totalLabel}>objetos detectados</Text>
          {Object.entries(resultado.resumen).map(([clase, cantidad]) => <Text key={clase} style={styles.detail}>• {cantidad} {clase}</Text>)}
        </View>
      )}
      <View style={styles.bottom}>
        {procesando ? <><ActivityIndicator color="#4ADE80" size="large" /><Text style={styles.processing}>Analizando foto...</Text></> : <TouchableOpacity style={styles.capture} onPress={tomarYContar}><Text style={styles.captureText}>{foto ? 'Nueva foto' : 'Tomar foto y contar'}</Text></TouchableOpacity>}
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>Volver</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' }, camera: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#10151c', padding: 24 },
  text: { color: '#fff', fontSize: 16 }, action: { backgroundColor: '#4ADE80', marginTop: 18, borderRadius: 12, padding: 13 }, actionText: { color: '#10151c', fontWeight: '800' },
  menu: { position: 'absolute', top: 42, left: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 22 },
  top: { position: 'absolute', top: 98, left: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 12, padding: 12 }, title: { color: '#fff', fontSize: 18, fontWeight: '800' }, hint: { color: '#c0c8d0', marginTop: 4, fontSize: 13 },
  result: { position: 'absolute', top: 180, left: 24, right: 24, backgroundColor: 'rgba(16,21,28,0.94)', borderRadius: 18, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: '#4ADE80' }, total: { color: '#4ADE80', fontSize: 54, fontWeight: '800' }, totalLabel: { color: '#fff', fontSize: 15, marginBottom: 10 }, detail: { color: '#d5dbe0', fontSize: 14, marginTop: 3 },
  bottom: { position: 'absolute', bottom: 38, left: 20, right: 20, alignItems: 'center' }, capture: { backgroundColor: '#4ADE80', borderRadius: 28, paddingHorizontal: 24, paddingVertical: 15 }, captureText: { color: '#10151c', fontWeight: '800' }, processing: { color: '#fff', marginTop: 10 }, back: { color: '#fff', marginTop: 15, fontWeight: '700' },
});
