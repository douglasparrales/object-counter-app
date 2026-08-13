import { useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

export default function AppMenu() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const progreso = useRef(new Animated.Value(0)).current;

  const abrir = () => {
    setVisible(true);
    Animated.timing(progreso, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  };
  const cerrar = (accion?: () => void) => {
    Animated.timing(progreso, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setVisible(false);
      accion?.();
    });
  };
  const mover = (ruta: '/history' | '/about' | '/') => cerrar(() => router.push(ruta));

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={abrir} accessibilityLabel="Abrir menú">
        <View style={styles.line} /><View style={styles.line} /><View style={styles.line} />
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="none" onRequestClose={() => cerrar()}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => cerrar()} />
          <Animated.View style={[styles.drawer, { transform: [{ translateX: progreso.interpolate({ inputRange: [0, 1], outputRange: [-300, 0] }) }] }]}>
            <Text style={styles.brand}>Object Counter</Text>
            <Text style={styles.subtitle}>Herramientas de conteo</Text>
            <TouchableOpacity style={styles.item} onPress={() => mover('/history')}><Text style={styles.itemText}>▤  Reportes</Text></TouchableOpacity>
            <TouchableOpacity style={styles.item} onPress={() => mover('/about')}><Text style={styles.itemText}>ⓘ  Acerca de</Text></TouchableOpacity>
            <TouchableOpacity style={styles.item} onPress={() => mover('/')}><Text style={styles.itemText}>⌂  Inicio</Text></TouchableOpacity>
            <Text style={styles.version}>Versión 1.0.0</Text>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { width: 44, height: 44, justifyContent: 'center', gap: 5, paddingHorizontal: 10 },
  line: { height: 2.5, backgroundColor: '#fff', borderRadius: 2, width: 23 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)' },
  drawer: { width: 286, height: '100%', backgroundColor: '#171d25', paddingTop: 64, paddingHorizontal: 22, borderRightWidth: 1, borderColor: '#34404c' },
  brand: { color: '#4ADE80', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#a7b0ba', fontSize: 13, marginTop: 5, marginBottom: 32 },
  item: { paddingVertical: 16, borderBottomWidth: 1, borderColor: '#29323d' },
  itemText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  version: { position: 'absolute', bottom: 34, left: 22, color: '#87929d', fontSize: 13 },
});
