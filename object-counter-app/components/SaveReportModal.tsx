import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Props = {
  visible: boolean;
  total: number;
  etiqueta: string;
  onClose: () => void;
  onSave: (ubicacion: string) => Promise<void>;
  onSaved: () => void;
};

export default function SaveReportModal({ visible, total, etiqueta, onClose, onSave, onSaved }: Props) {
  const [ubicacion, setUbicacion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const escalaConfirmacion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setUbicacion('');
      setGuardando(false);
      setGuardado(false);
      escalaConfirmacion.setValue(0);
    }
  }, [visible]);

  const guardar = async () => {
    if (guardando || guardado) return;
    setGuardando(true);
    try {
      await onSave(ubicacion.trim());
      setGuardado(true);
      Animated.spring(escalaConfirmacion, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
      setTimeout(() => {
        onSaved();
        onClose();
      }, 1100);
    } catch (error) {
      console.log('[Reporte] No se pudo guardar:', error);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {guardado ? (
            <Animated.View style={[styles.saved, { transform: [{ scale: escalaConfirmacion }], opacity: escalaConfirmacion }]}>
              <Text style={styles.check}>✓</Text>
              <Text style={styles.savedText}>Reporte guardado</Text>
            </Animated.View>
          ) : (<>
            <Text style={styles.title}>Conteo finalizado</Text>
            <Text style={styles.number}>{total}</Text>
            <Text style={styles.label}>{etiqueta} contados</Text>
            <TextInput style={styles.input} placeholder="Lugar: Lab 1, sala, bodega..." placeholderTextColor="#999" value={ubicacion} onChangeText={setUbicacion} />
            <View style={styles.actions}>
              <TouchableOpacity style={styles.later} onPress={onClose}><Text style={styles.laterText}>Ahora no</Text></TouchableOpacity>
              <TouchableOpacity style={styles.save} onPress={guardar} disabled={guardando}>{guardando ? <ActivityIndicator color="#111" /> : <Text style={styles.saveText}>Guardar</Text>}</TouchableOpacity>
            </View>
          </>)}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#171d25', borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#4ADE80' },
  title: { color: '#4ADE80', fontSize: 19, fontWeight: '800' }, number: { color: '#fff', fontSize: 64, fontWeight: '800', marginTop: 8 }, label: { color: '#b7c0c9', fontSize: 15, marginBottom: 20 },
  input: { width: '100%', borderWidth: 1.5, borderColor: '#4ADE80', borderRadius: 12, padding: 14, color: '#fff', fontSize: 16, marginBottom: 20, backgroundColor: '#222' },
  actions: { flexDirection: 'row', gap: 16 }, later: { backgroundColor: '#333', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 }, laterText: { color: '#fff', fontSize: 14 }, save: { backgroundColor: '#4ADE80', borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 }, saveText: { color: '#111', fontWeight: '700', fontSize: 14 },
  saved: { minHeight: 210, justifyContent: 'center', alignItems: 'center' }, check: { color: '#4ADE80', fontSize: 70, fontWeight: '800' }, savedText: { color: '#fff', fontWeight: '800', fontSize: 18, marginTop: 8 },
});
