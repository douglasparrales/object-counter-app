import { useRef, useState } from 'react';
import {
  StyleSheet, View, Text, Pressable, TouchableOpacity,
  Image, ActivityIndicator, Modal, TextInput, Alert
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useDetection } from '../hooks/useDetection';

export default function CameraScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const device = useCameraDevice(facing);
  const cameraRef = useRef<Camera>(null);
  const modalCameraRef = useRef<Camera>(null);

  // Estados del modal de referencia
  const [modalVisible, setModalVisible] = useState(false);
  const [fotoCapturada, setFotoCapturada] = useState<string | null>(null);
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [claseYoloLocal, setClaseYoloLocal] = useState<string | null>(null);
  const [capturando, setCapturando] = useState(false);

  const {
    counts, isDetecting, objetoReferencia,
    identificando, identificarFoto, confirmarObjeto,
    startDetection, stopDetection, limpiarReferencia,
  } = useDetection();

  // Abre el modal para tomar foto de referencia
  const abrirModalReferencia = () => {
    setFotoCapturada(null);
    setNombreUsuario('');
    setClaseYoloLocal(null);
    setModalVisible(true);
  };

  // El usuario toma la foto manualmente dentro del modal
  const tomarFotoEnModal = async () => {
    if (!modalCameraRef.current || capturando) return;
    setCapturando(true);
    try {
      const photo = await modalCameraRef.current.takePhoto();
      const uri = `file://${photo.path}`;
      setFotoCapturada(uri);

      // Identificar qué es
      const clase = await identificarFoto(uri);
      setClaseYoloLocal(clase);
    } catch (err: any) {
      Alert.alert('Error', 'No se pudo tomar la foto');
    } finally {
      setCapturando(false);
    }
  };

  // El usuario confirma con su nombre personalizado
  const confirmar = () => {
    if (!fotoCapturada || !claseYoloLocal) return;
    const nombre = nombreUsuario.trim() || claseYoloLocal;
    confirmarObjeto(claseYoloLocal, nombre, fotoCapturada);
    setModalVisible(false);
  };

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

      {/* Cámara principal */}
      <Camera
        ref={cameraRef}
        style={styles.camera}
        device={device}
        isActive={!modalVisible}
        photo={true}
      />

      {/* Preview objeto de referencia — esquina superior derecha */}
      {objetoReferencia && (
        <View style={styles.referenceBox}>
          <Image
            source={{ uri: objetoReferencia.imagenUri }}
            style={styles.referenceImage}
          />

          <Text
            style={{
              color: '#fff',
              fontSize: 10,
              textAlign: 'center',
            }}
          >
            Contando:
          </Text>

          <Text
            style={styles.referenceText}
            numberOfLines={2}
          >
            {objetoReferencia.nombreUsuario}
          </Text>

          <TouchableOpacity
            onPress={limpiarReferencia}
            style={styles.clearBtn}
          >
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Badges de conteo */}
      {counts.length > 0 && (
        <View style={styles.overlay}>
          {counts.map((item) => (
            <View key={item.clase} style={styles.countBadge}>
              <Text style={styles.countClass}>
                {objetoReferencia?.nombreUsuario ?? item.clase}
              </Text>
              <Text style={styles.countNum}>{item.cantidad}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Controles */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.flipBtn}
          onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
        >
          <Text style={styles.flipText}>Voltear</Text>
        </TouchableOpacity>

        {!isDetecting && (
          <TouchableOpacity
            style={[styles.refBtn, objetoReferencia && styles.refBtnActive]}
            onPress={abrirModalReferencia}
          >
            <Text style={styles.refBtnText}>
              {objetoReferencia ? '🔄 Cambiar' : '📷 Qué contar'}
            </Text>
          </TouchableOpacity>
        )}

        <Pressable
          style={[styles.captureBtn, isDetecting && styles.captureBtnActive]}
          onPress={isDetecting ? stopDetection : () => startDetection(cameraRef)}
        >
          <Text style={styles.captureText}>
            {isDetecting ? 'Detener' : 'Contar'}
          </Text>
        </Pressable>
      </View>

      {/* ── MODAL DE FOTO DE REFERENCIA ── */}
      <Modal visible={modalVisible} animationType="slide">
        <View style={styles.modalContainer}>

          {!fotoCapturada ? (
            // Paso 1: cámara para encuadrar el objeto
            <>
              <Camera
                ref={modalCameraRef}
                style={styles.modalCamera}
                device={device}
                isActive={modalVisible && !fotoCapturada}
                photo={true}
              />
              <Text style={styles.modalHint}>
                Encuadra el objeto que quieres contar
              </Text>
              <View style={styles.modalControls}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.shutterBtn}
                  onPress={tomarFotoEnModal}
                  disabled={capturando}
                >
                  {capturando
                    ? <ActivityIndicator color="#111" />
                    : <Text style={styles.shutterText}>📸</Text>
                  }
                </TouchableOpacity>
              </View>
            </>
          ) : (
            // Paso 2: confirmar y ponerle nombre
            <View style={styles.confirmContainer}>
              <Image source={{ uri: fotoCapturada }} style={styles.confirmImage} />

              {identificando ? (
                <>
                  <ActivityIndicator size="large" color="#185FA5" style={{ marginTop: 20 }} />
                  <Text style={styles.confirmHint}>Identificando objeto...</Text>
                </>
              ) : (
                <>
                  <Text style={styles.confirmDetected}>
                    {claseYoloLocal
                      ? `YOLO detectó: "${claseYoloLocal}"`
                      : '⚠️ No se reconoció el objeto'}
                  </Text>
                  <Text style={styles.confirmHint}>
                    ¿Cómo quieres llamar a este objeto?
                  </Text>
                  <TextInput
                    style={styles.nameInput}
                    placeholder={claseYoloLocal ?? 'Nombre del objeto'}
                    placeholderTextColor="#999"
                    value={nombreUsuario}
                    onChangeText={setNombreUsuario}
                    autoFocus
                  />
                  <View style={styles.confirmBtns}>
                    <TouchableOpacity
                      style={styles.retakeBtn}
                      onPress={() => setFotoCapturada(null)}
                    >
                      <Text style={styles.retakeBtnText}>🔄 Retomar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.confirmBtn, !claseYoloLocal && styles.confirmBtnDisabled]}
                      onPress={confirmar}
                      disabled={!claseYoloLocal}
                    >
                      <Text style={styles.confirmBtnText}>✅ Confirmar</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  message: { fontSize: 16, textAlign: 'center', color: '#333' },
  referenceBox: {
    position: 'absolute', top: 16, right: 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 12, padding: 8, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#4ADE80', maxWidth: 100,
  },
  referenceImage: { width: 72, height: 72, borderRadius: 8, marginBottom: 4 },
  referenceText: { color: '#4ADE80', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  clearBtn: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 10, width: 18, height: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  clearBtnText: { color: '#fff', fontSize: 10 },
  overlay: { position: 'absolute', top: 60, left: 16, right: 110 },
  countBadge: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  countClass: { color: '#fff', fontSize: 15 },
  countNum: { color: '#4ADE80', fontWeight: '800', fontSize: 28 },
  controls: {
    position: 'absolute', bottom: 50, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 14,
  },
  flipBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 24, paddingHorizontal: 14, paddingVertical: 10,
  },
  flipText: { color: '#fff', fontSize: 13 },
  refBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  refBtnActive: { borderColor: '#4ADE80' },
  refBtnText: { color: '#fff', fontSize: 12 },
  captureBtn: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  captureBtnActive: { backgroundColor: '#EF4444' },
  captureText: { fontWeight: '700', color: '#111', fontSize: 13 },
  btn: {
    backgroundColor: '#185FA5', borderRadius: 10,
    paddingHorizontal: 24, paddingVertical: 14,
  },
  btnText: { color: '#fff' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#000' },
  modalCamera: { flex: 1 },
  modalHint: {
    position: 'absolute', top: 60, left: 0, right: 0,
    textAlign: 'center', color: '#fff',
    fontSize: 15, backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 8,
  },
  modalControls: {
    position: 'absolute', bottom: 50, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 32,
  },
  cancelBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20, paddingHorizontal: 20, paddingVertical: 12,
  },
  cancelBtnText: { color: '#fff', fontSize: 15 },
  shutterBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  shutterText: { fontSize: 28 },

  // Confirmación
  confirmContainer: {
    flex: 1, backgroundColor: '#111',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  confirmImage: {
    width: 220, height: 220, borderRadius: 16,
    marginBottom: 16, borderWidth: 2, borderColor: '#4ADE80',
  },
  confirmDetected: { color: '#aaa', fontSize: 13, marginBottom: 8 },
  confirmHint: { color: '#fff', fontSize: 16, marginBottom: 12, textAlign: 'center' },
  nameInput: {
    width: '100%', borderWidth: 1.5, borderColor: '#4ADE80',
    borderRadius: 12, padding: 14, color: '#fff',
    fontSize: 16, marginBottom: 20, backgroundColor: '#222',
  },
  confirmBtns: { flexDirection: 'row', gap: 16 },
  retakeBtn: {
    backgroundColor: '#333', borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  retakeBtnText: { color: '#fff', fontSize: 14 },
  confirmBtn: {
    backgroundColor: '#4ADE80', borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  confirmBtnDisabled: { backgroundColor: '#444' },
  confirmBtnText: { color: '#111', fontWeight: '700', fontSize: 14 },
});