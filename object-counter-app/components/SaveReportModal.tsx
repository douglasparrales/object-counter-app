import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

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
  const [error, setError] = useState('');
  const bloqueo = useRef(false);
  const entrada = useRef(new Animated.Value(1)).current;
  const reducirMovimiento = useRef(false);
  useEffect(() => {
    let activa = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (activa) reducirMovimiento.current = value; });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reducirMovimiento.current = value; });
    return () => { activa = false; subscription.remove(); entrada.stopAnimation(); };
  }, [entrada]);

  useEffect(() => {
    if (visible) {
      setUbicacion('');
      setGuardando(false);
      setGuardado(false);
      setError('');
      bloqueo.current = false;
    }
  }, [visible]);

  const cerrar = () => {
    if (bloqueo.current) return;
    if (guardado) onSaved();
    onClose();
  };

  const guardar = async () => {
    if (bloqueo.current || guardado) return;
    bloqueo.current = true;
    setGuardando(true);
    setError('');
    Keyboard.dismiss();
    const feedback = reducirMovimiento.current ? Promise.resolve() : new Promise<void>(resolve => {
      Animated.sequence([
        Animated.timing(entrada, { toValue: 0.97, duration: 80, useNativeDriver: true }),
        Animated.timing(entrada, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start(() => resolve());
    });
    try {
      await Promise.all([onSave(ubicacion.trim()), feedback]);
      setGuardado(true);
    } catch {
      setError('No se pudo guardar el reporte. Intenta de nuevo.');
    } finally {
      bloqueo.current = false;
      setGuardando(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cerrar}>
      <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card} accessibilityViewIsModal>
            <Text style={styles.eyebrow}>RESUMEN DEL CONTEO</Text>
            <Text accessibilityRole="header" style={styles.title}>{guardado ? 'Reporte guardado' : 'Conteo finalizado'}</Text>
            <Text style={styles.description}>{guardado ? 'Disponible en Reportes para consultarlo cuando lo necesites.' : 'Guarda el resultado y añade una ubicación para encontrarlo fácilmente.'}</Text>
            <View style={styles.summary}>
              <Text style={styles.number}>{total}</Text>
              <View style={styles.summaryInfo}>
                <Text style={styles.label}>{etiqueta}</Text>
                <Text style={styles.description}>{total === 1 ? 'objeto contado' : 'objetos contados'}</Text>
              </View>
            </View>
            {guardado ? (
              <TouchableOpacity accessibilityRole="button" style={styles.save} onPress={cerrar}><Text style={styles.saveText}>Listo</Text></TouchableOpacity>
            ) : (<>
              <Text style={styles.fieldLabel}>Ubicación <Text style={styles.optional}>(opcional)</Text></Text>
              <TextInput accessibilityLabel="Ubicación del conteo, opcional" style={styles.input} placeholder="Por ejemplo, bodega principal" placeholderTextColor="#87929d" value={ubicacion} onChangeText={setUbicacion} editable={!guardando} maxLength={160} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              {!!error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
              <View style={styles.actions}>
                <TouchableOpacity accessibilityRole="button" style={[styles.later, guardando && styles.disabled]} onPress={cerrar} disabled={guardando}><Text style={styles.laterText}>Ahora no</Text></TouchableOpacity>
                <Animated.View style={[styles.grow, { transform: [{ scale: entrada }] }]}><TouchableOpacity accessibilityRole="button" accessibilityLabel={guardando ? 'Guardando reporte' : 'Guardar reporte'} style={[styles.save, guardando && styles.disabled]} onPress={guardar} disabled={guardando}>{guardando ? <ActivityIndicator color="#10151c" /> : <Text style={styles.saveText}>Guardar</Text>}</TouchableOpacity></Animated.View>
              </View>
            </>)}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 440, alignSelf: 'center', backgroundColor: '#171d25', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#34404c' },
  eyebrow: { color: '#4ADE80', fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginBottom: 10 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  description: { color: '#a7b0ba', fontSize: 14, lineHeight: 21, marginTop: 6 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 18, backgroundColor: '#10151c', borderRadius: 12, padding: 18, marginVertical: 24 },
  number: { color: '#4ADE80', fontSize: 44, fontWeight: '700', flexShrink: 1 },
  summaryInfo: { flex: 1 },
  label: { color: '#fff', fontSize: 16, fontWeight: '600' },
  fieldLabel: { color: '#d0d6dc', fontSize: 13, marginBottom: 8 },
  optional: { color: '#87929d' },
  input: { borderWidth: 1, borderColor: '#34404c', borderRadius: 10, padding: 14, color: '#fff', fontSize: 15, marginBottom: 20, backgroundColor: '#10151c' },
  actions: { flexDirection: 'row', gap: 12 },
  later: { flex: 1, backgroundColor: '#27303a', borderRadius: 10, minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center' },
  laterText: { color: '#d0d6dc', fontSize: 14, fontWeight: '600' },
  save: { backgroundColor: '#4ADE80', borderRadius: 10, minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
  saveText: { color: '#10151c', fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.55 },
  error: { color: '#fca5a5', fontSize: 13, lineHeight: 19, marginBottom: 16 },
});
