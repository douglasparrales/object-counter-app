import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Pressable } from 'react-native';
import { useDetection } from '../hooks/useDetection';

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const cameraRef = useRef(null);

  const { counts, isDetecting, startDetection, stopDetection } = useDetection();

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>
          La app necesita acceso a la cámara para contar objetos.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Dar permiso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
      >
        {/* Overlay */}
        <View style={styles.overlay}>
          {counts.map((item) => (
            <View key={item.clase} style={styles.countBadge}>
              <Text style={styles.countClass}>{item.clase}</Text>
              <Text style={styles.countNum}>{item.cantidad}</Text>
            </View>
          ))}
        </View>

        {/* Controles */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.flipBtn}
            onPress={() => setFacing(f => (f === 'back' ? 'front' : 'back'))}
          >
            <Text style={styles.flipText}>Voltear</Text>
          </TouchableOpacity>

          <Pressable
            style={[
              styles.captureBtn,
              isDetecting && styles.captureBtnActive
            ]}
            onPress={isDetecting ? stopDetection : startDetection}
          >
            <Text style={styles.captureText}>
              {isDetecting ? 'Detener' : 'Contar'}
            </Text>
          </Pressable>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },

  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },

  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
    color: '#333'
  },

  overlay: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    flexDirection: 'row',
    flexWrap: 'wrap'
  },

  countBadge: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 8
  },

  countClass: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500'
  },

  countNum: {
    color: '#4ADE80',
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 8
  },

  controls: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center'
  },

  flipBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginRight: 20
  },

  flipText: {
    color: '#fff',
    fontSize: 15
  },

  captureBtn: {
    backgroundColor: '#fff',
    borderRadius: 40,
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center'
  },

  captureBtnActive: {
    backgroundColor: '#EF4444'
  },

  captureText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111'
  },

  btn: {
    backgroundColor: '#185FA5',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 14
  },

  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  }
});