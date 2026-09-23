import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Button, KeyboardAvoidingView, Platform, ScrollView, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { checkBackendConnection, getBackendUrl, setBackendUrl } from '../config/backend';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const SettingsModal = ({ visible, onClose }: Props) => {
  const [ip, setIp] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (visible) {
      getBackendUrl().then(setIp).catch(() => setIp(''));
    }
  }, [visible]);

  const handleSave = async () => {
    try {
      const savedUrl = await setBackendUrl(ip);
      setIp(savedUrl);
      Alert.alert('Dirección guardada', `La app usará ${savedUrl}`);
      onClose();
    } catch (error: any) {
      Alert.alert('No se pudo guardar', error?.message || 'Revisa la dirección ingresada.');
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    try {
      await checkBackendConnection(ip);
      Alert.alert('Conexión correcta', 'La app puede comunicarse con el servidor.');
    } catch (error: any) {
      Alert.alert('Sin conexión', `${error?.message || 'No se pudo conectar.'}\n\nComprueba que ambos dispositivos estén en la misma red, que Uvicorn use --host 0.0.0.0 y que el firewall permita el puerto 8000.`);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={() => { if (!checking) onClose(); }}>
      <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Conexión al servidor</Text>
          <Text style={styles.label}>Dirección IP o URL</Text>
          <TextInput
            style={styles.input}
            value={ip}
            onChangeText={setIp}
            placeholder="192.168.1.25"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!checking}
            placeholderTextColor="#87929d"
          />
          <Text style={styles.help}>Puedes escribir solo la IP; se agregará http:// y el puerto 8000.</Text>
          <View style={styles.checkButton}>
            {checking ? <ActivityIndicator /> : <Button title="Probar conexión" onPress={handleCheck} />}
          </View>
          <View style={styles.buttons}>
            <Button title="Cancelar" color="#888" onPress={onClose} disabled={checking} />
            <Button title="Guardar" onPress={handleSave} disabled={checking} />
          </View>
        </View>
      </View>
      </ScrollView>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  container: { backgroundColor: '#171d25', padding: 24, borderRadius: 20, width: '100%', maxWidth: 440, alignSelf: 'center', borderWidth: 1, borderColor: '#34404c' },
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 15 },
  label: { color: '#d0d6dc', fontSize: 14, marginBottom: 5 },
  input: { color: '#fff', backgroundColor: '#10151c', borderWidth: 1, borderColor: '#34404c', borderRadius: 10, padding: 14 },
  help: { color: '#a7b0ba', fontSize: 12, lineHeight: 17, marginTop: 6 },
  checkButton: { alignItems: 'flex-start', marginVertical: 14, minHeight: 36, justifyContent: 'center' },
  buttons: { flexDirection: 'row', justifyContent: 'space-between' },
});
