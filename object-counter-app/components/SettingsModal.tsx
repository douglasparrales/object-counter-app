import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { getBackendUrl, setBackendUrl } from '../config/backend';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const SettingsModal = ({ visible, onClose }: Props) => {
  const [ip, setIp] = useState('');

  useEffect(() => {
    if (visible) {
      getBackendUrl().then(setIp);
    }
  }, [visible]);

  const handleSave = async () => {
    if (!ip.trim()) {
      Alert.alert('Error', 'Ingresa una IP válida');
      return;
    }
    await setBackendUrl(ip);
    Alert.alert('Éxito', 'Dirección IP actualizada');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Configuración de Backend</Text>
          <Text style={styles.label}>IP o URL del Servidor FastAPI:</Text>
          <TextInput
            style={styles.input}
            value={ip}
            onChangeText={setIp}
            placeholder="http://192.168.1.X:8000"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.buttons}>
            <Button title="Cancelar" color="#888" onPress={onClose} />
            <Button title="Guardar" onPress={handleSave} />
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
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 10, marginBottom: 20 },
  buttons: { flexDirection: 'row', justifyContent: 'space-between' },
});