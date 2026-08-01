import { useRef, useState } from 'react';
import { StyleSheet, View, Text, Pressable, TouchableOpacity } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useDetection } from '../hooks/useDetection';

export default function CameraScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const device    = useCameraDevice(facing);
  const cameraRef = useRef<Camera>(null);

  const { counts, isDetecting, modelReady, startDetection, stopDetection } = useDetection();

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>La app necesita acceso a la cámara.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Dar permiso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>No se encontró cámara.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={styles.camera}
        device={device}
        isActive={true}
        photo={true}
      />

      <View style={styles.statusBar}>
        <View style={[styles.dot, { backgroundColor: modelReady ? '#4ADE80' : '#FFC107' }]} />
        <Text style={styles.statusText}>
          {modelReady ? 'Modelo listo' : 'Cargando modelo...'}
        </Text>
      </View>

      {counts.length > 0 && (
        <View style={styles.overlay}>
          {counts.map((item) => (
            <View key={item.clase} style={styles.countBadge}>
              <Text style={styles.countClass}>{item.clase}</Text>
              <Text style={styles.countNum}>{item.cantidad}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.flipBtn}
          onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
        >
          <Text style={styles.flipText}>Voltear</Text>
        </TouchableOpacity>

        <Pressable
          style={[styles.captureBtn, isDetecting && styles.captureBtnActive]}
          onPress={isDetecting ? stopDetection : () => startDetection(cameraRef)}
          disabled={!modelReady}
        >
          <Text style={styles.captureText}>
            {!modelReady ? '...' : isDetecting ? 'Detener' : 'Contar'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#000' },
  camera:           { flex: 1 },
  centered:         { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  message:          { fontSize: 16, textAlign: 'center' },
  statusBar: {
    position: 'absolute', top: 16, left: 16,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  dot:          { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText:   { color: '#fff', fontSize: 12 },
  overlay: {
    position: 'absolute', top: 60, left: 16, right: 16,
  },
  countBadge: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 12, marginBottom: 8,
  },
  countClass:   { color: '#fff' },
  countNum:     { color: '#4ADE80', fontWeight: '700', fontSize: 20 },
  controls: {
    position: 'absolute', bottom: 50, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center',
  },
  flipBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 24, paddingHorizontal: 20,
    paddingVertical: 12, marginRight: 20,
  },
  flipText:         { color: '#fff' },
  captureBtn: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  captureBtnActive: { backgroundColor: '#EF4444' },
  captureText:      { fontWeight: '600', color: '#111' },
  btn: {
    backgroundColor: '#185FA5', borderRadius: 10,
    paddingHorizontal: 24, paddingVertical: 14,
  },
  btnText: { color: '#fff' },
});