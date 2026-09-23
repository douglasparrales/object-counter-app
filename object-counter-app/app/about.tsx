import { SafeAreaView } from 'react-native-safe-area-context';
import { useMemo } from 'react';
import { PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import AppMenu from '../components/AppMenu';

export default function AboutScreen() {
  const router = useRouter();
  const gestoHistorial = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesto) => gesto.dx < -25 && Math.abs(gesto.dx) > Math.abs(gesto.dy),
    onPanResponderRelease: (_, gesto) => { if (gesto.dx < -80) router.push('/history'); },
  }), [router]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#10151c' }}>
    <View style={styles.container} {...gestoHistorial.panHandlers}>
      <View style={[styles.menu, { top: 8 }]}><AppMenu /></View>
      <TouchableOpacity onPress={() => router.back()} style={[styles.topBack, { top: 10 }]}><Text style={styles.topBackText}>‹</Text></TouchableOpacity>
      <View style={styles.content}>
        <Text style={styles.title}>Object Counter</Text>
        <Text style={styles.text}>Cuenta objetos en una foto o recorre una superficie con la cámara. Revisa tus resultados y guárdalos con su ubicación.</Text>
        <Text style={styles.text}>Para contar con la cámara, mantén los objetos quietos y avanza despacio sobre una superficie con detalles visibles.</Text>
        <Text style={styles.version}>Versión 1.0.0</Text>
      </View>
    </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#10151c' },
  content: { flex: 1, justifyContent: 'center', padding: 28 },
  title: { color: '#4ADE80', fontSize: 30, fontWeight: '800' },
  text: { color: '#d0d6dc', fontSize: 16, lineHeight: 24, marginTop: 16 },
  version: { color: '#909aa5', marginTop: 22, fontSize: 14 },
  menu: { position: 'absolute', top: 42, left: 10, zIndex: 1 },
  topBack: { position: 'absolute', top: 45, right: 14, width: 38, height: 38, borderRadius: 19, backgroundColor: '#202934', justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  topBackText: { color: '#fff', fontSize: 34, lineHeight: 34 },
});
