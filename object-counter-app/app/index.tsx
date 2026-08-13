import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import AppMenu from '../components/AppMenu';

export default function Index() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <View style={styles.menu}><AppMenu /></View>
      <Image source={require('../assets/icon.png')} style={styles.icon} />
      <Text style={styles.title}>Object Counter</Text>
      <Text style={styles.description}>Elige cómo quieres contar.</Text>
      <TouchableOpacity style={styles.button} onPress={() => router.push('/static-count')}>
        <Text style={styles.buttonText}>Contar desde una foto</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/camera')}>
        <Text style={styles.secondaryButtonText}>Conteo en tiempo real</Text>
      </TouchableOpacity>
      <Text style={styles.version}>Versión 1.0.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#10151c', justifyContent: 'center', alignItems: 'center', padding: 32 },
  icon: { width: 142, height: 142, borderRadius: 30, marginBottom: 22 },
  title: { color: '#fff', fontSize: 30, fontWeight: '800' },
  description: { color: '#abb3bc', fontSize: 16, textAlign: 'center', marginTop: 12, lineHeight: 23 },
  button: { backgroundColor: '#4ADE80', paddingHorizontal: 34, paddingVertical: 15, borderRadius: 14, marginTop: 32 },
  buttonText: { color: '#10151c', fontSize: 16, fontWeight: '800' },
  version: { position: 'absolute', bottom: 36, color: '#7e8791', fontSize: 13 },
  menu: { position: 'absolute', top: 44, left: 12 },
  secondaryButton: { borderWidth: 1, borderColor: '#4ADE80', paddingHorizontal: 26, paddingVertical: 14, borderRadius: 14, marginTop: 12 },
  secondaryButtonText: { color: '#4ADE80', fontSize: 15, fontWeight: '700' },
});
