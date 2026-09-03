import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Button, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
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
      Alert.alert('Conexión correcta', 'La APK puede comunicarse con el backend.');
    } catch (error: any) {
      Alert.alert('Sin conexión', `${error?.message || 'No se pudo conectar.'}\n\nComprueba que ambos dispositivos estén en la misma red, que Uvicorn use --host 0.0.0.0 y que el firewall permita el puerto 8000.`);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Configuración de Backend</Text>
          <Text style={styles.label}>IP o URL del servidor FastAPI</Text>
          <TextInput
            style={styles.input}
            value={ip}
            onChangeText={setIp}
            placeholder="192.168.1.25"
            autoCapitalize="none"
            autoCorrect={false}
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
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  container: { backgroundColor: '#fff', padding: 20, borderRadius: 10 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  label: { fontSize: 14, marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 10 },
  help: { color: '#666', fontSize: 12, lineHeight: 17, marginTop: 6 },
  checkButton: { alignItems: 'flex-start', marginVertical: 14, minHeight: 36, justifyContent: 'center' },
  buttons: { flexDirection: 'row', justifyContent: 'space-between' },
});
