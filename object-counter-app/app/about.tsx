import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import AppMenu from '../components/AppMenu';

export default function AboutScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <AppMenu />
      <View style={styles.content}>
        <Text style={styles.title}>Object Counter</Text>
        <Text style={styles.text}>Aplicación de conteo visual de objetos mediante cámara e inteligencia artificial.</Text>
        <Text style={styles.version}>Versión 1.0.0</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>Volver</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#10151c', paddingTop: 44, paddingLeft: 12 },
  content: { flex: 1, justifyContent: 'center', padding: 28, paddingLeft: 20 },
  title: { color: '#4ADE80', fontSize: 30, fontWeight: '800' },
  text: { color: '#d0d6dc', fontSize: 16, lineHeight: 24, marginTop: 16 },
  version: { color: '#909aa5', marginTop: 22, fontSize: 14 },
  back: { marginTop: 32, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#4ADE80', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11 },
  backText: { color: '#4ADE80', fontWeight: '700' },
});
