import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

export default function Index() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Image source={require('../assets/icon.png')} style={styles.icon} />
      <Text style={styles.title}>Object Counter</Text>
      <Text style={styles.description}>Cuenta objetos con cámara y una referencia visual.</Text>
      <TouchableOpacity style={styles.button} onPress={() => router.replace('/camera')}>
        <Text style={styles.buttonText}>Comenzar</Text>
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
});
