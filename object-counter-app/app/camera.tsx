import { useRef, useState } from 'react';
import {
  StyleSheet, View, Text, Pressable, TouchableOpacity,
  Image, ActivityIndicator, Modal, TextInput, Alert,
  useWindowDimensions,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useDetection, Deteccion } from '../hooks/useDetection';

// Componente que dibuja UN bounding box sobre la cámara
function BoundingBox({
  det, screenW, screenH,
}: {
  det: Deteccion;
  screenW: number;
  screenH: number;
}) {
  const boxW = det.w * screenW;
  const boxH = det.h * screenH;
  const left = (det.cx - det.w / 2) * screenW;
  const top  = (det.cy - det.h / 2) * screenH;

  // Verde = ya estaba contado, Blanco = recién contado en este frame
  const color = det.ya_contado ? '#4ADE80' : '#FFFFFF';

  return (
    <View style={{
      position: 'absolute', left, top,
      width: boxW, height: boxH,
      borderWidth: 2, borderColor: color, borderRadius: 4,
    }}>
      {/* ID del objeto en esquina superior izquierda */}
      <View style={{
        position: 'absolute', top: -20, left: 0,
        backgroundColor: color,
        paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3,
        flexDirection: 'row', gap: 4,
      }}>
        <Text style={{ color: '#111', fontSize: 10, fontWeight: '700' }}>
          #{det.track_id} {det.clase}
        </Text>
      </View>
    </View>
  );
}

export default function CameraScreen() {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { hasPermission, requestPermission } = useCameraPermission();
  const [facing, setFacing]     = useState<'back' | 'front'>('back');
  const device                  = useCameraDevice(facing);
  const cameraRef               = useRef<Camera>(null);
  const modalCameraRef          = useRef<Camera>(null);

  const [modalVisible, setModalVisible]     = useState(false);
  const [fotoCapturada, setFotoCapturada]   = useState<string | null>(null);
  const [nombreUsuario, setNombreUsuario]   = useState('');
  const [claseYoloLocal, setClaseYoloLocal] = useState<string | null>(null);
  const [capturando, setCapturando]         = useState(false);

  const {
    totalContado, deteccionesActuales, isDetecting,
    objetoReferencia, identificando, claseDetectada,
    identificarFoto, confirmarObjeto,
    startDetection, stopDetection, limpiarReferencia,
  } = useDetection();

  const abrirModalReferencia = () => {
    setFotoCapturada(null);
    setNombreUsuario('');
    setClaseYoloLocal(null);
    setModalVisible(true);
  };

  const tomarFotoEnModal = async () => {
    if (!modalCameraRef.current || capturando) return;
    setCapturando(true);
    try {
      const photo = await modalCameraRef.current.takePhoto();
      const uri   = `file://${photo.path}`;
      setFotoCapturada(uri);
      const clase = await identificarFoto(uri);
      setClaseYoloLocal(clase);
    } catch {
      Alert.alert('Error', 'No se pudo tomar la foto');
    } finally {
      setCapturando(false);
    }
  };

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
      <Camera
        ref={cameraRef}
        style={styles.camera}
        device={device}
        isActive={!modalVisible}
        photo={true}
      />

      {/* Bounding boxes sobre la cámara */}
      {isDetecting && deteccionesActuales.map((det, i) => (
        <BoundingBox
          key={`${det.clase}-${i}`}
          det={det}
          screenW={screenW}
          screenH={screenH}
        />
      ))}

      {/* Preview objeto de referencia */}
      {objetoReferencia && (
        <View style={styles.referenceBox}>
          <Image source={{ uri: objetoReferencia.imagenUri }} style={styles.referenceImage} />
          <Text style={styles.referenceText} numberOfLines={2}>
            {objetoReferencia.nombreUsuario}
          </Text>
          <TouchableOpacity onPress={limpiarReferencia} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Contador total acumulado */}
      {isDetecting && (
        <View style={styles.totalBadge}>
          <Text style={styles.totalLabel}>
            {objetoReferencia?.nombreUsuario ?? 'Objetos'}
          </Text>
          <Text style={styles.totalNum}>{totalContado}</Text>
          <Text style={styles.totalSub}>
            viendo: {deteccionesActuales.length}
          </Text>
        </View>
      )}

      {/* Leyenda de colores */}
      {isDetecting && (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#fff' }]} />
            <Text style={styles.legendText}>Detectado</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#4ADE80' }]} />
            <Text style={styles.legendText}>Ya contado</Text>
          </View>
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

      {/* MODAL DE REFERENCIA */}
      <Modal visible={modalVisible} animationType="slide">
        <View style={styles.modalContainer}>
          {!fotoCapturada ? (
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
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shutterBtn} onPress={tomarFotoEnModal} disabled={capturando}>
                  {capturando
                    ? <ActivityIndicator color="#111" />
                    : <Text style={styles.shutterText}>📸</Text>}
                </TouchableOpacity>
              </View>
            </>
          ) : (
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
                  <Text style={styles.confirmHint}>¿Cómo quieres llamar a este objeto?</Text>
                  <TextInput
                    style={styles.nameInput}
                    placeholder={claseYoloLocal ?? 'Nombre del objeto'}
                    placeholderTextColor="#999"
                    value={nombreUsuario}
                    onChangeText={setNombreUsuario}
                    autoFocus
                  />
                  <View style={styles.confirmBtns}>
                    <TouchableOpacity style={styles.retakeBtn} onPress={() => setFotoCapturada(null)}>
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
  container:        { flex: 1, backgroundColor: '#000' },
  camera:           { flex: 1 },
  centered:         { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  message:          { fontSize: 16, textAlign: 'center', color: '#333' },

  referenceBox: {
    position: 'absolute', top: 16, right: 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 12, padding: 8, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#4ADE80', maxWidth: 100,
  },
  referenceImage:   { width: 72, height: 72, borderRadius: 8, marginBottom: 4 },
  referenceText:    { color: '#4ADE80', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  clearBtn: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 10, width: 18, height: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  clearBtnText:     { color: '#fff', fontSize: 10 },

  totalBadge: {
    position: 'absolute', top: 60, left: 16,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 16, paddingHorizontal: 20, paddingVertical: 12,
    borderWidth: 2, borderColor: '#4ADE80', alignItems: 'center',
  },
  totalLabel:       { color: '#aaa', fontSize: 11, marginBottom: 2 },
  totalNum:         { color: '#4ADE80', fontSize: 52, fontWeight: '800', lineHeight: 56 },
  totalSub:         { color: '#888', fontSize: 11, marginTop: 2 },

  legend: {
    position: 'absolute', bottom: 160, left: 16,
    gap: 6,
  },
  legendItem:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:        { width: 10, height: 10, borderRadius: 5 },
  legendText:       { color: '#fff', fontSize: 11 },

  controls: {
    position: 'absolute', bottom: 50, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 14,
  },
  flipBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 24, paddingHorizontal: 14, paddingVertical: 10,
  },
  flipText:         { color: '#fff', fontSize: 13 },
  refBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  refBtnActive:     { borderColor: '#4ADE80' },
  refBtnText:       { color: '#fff', fontSize: 12 },
  captureBtn: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  captureBtnActive: { backgroundColor: '#EF4444' },
  captureText:      { fontWeight: '700', color: '#111', fontSize: 13 },
  btn: {
    backgroundColor: '#185FA5', borderRadius: 10,
    paddingHorizontal: 24, paddingVertical: 14,
  },
  btnText:          { color: '#fff' },

  modalContainer:   { flex: 1, backgroundColor: '#000' },
  modalCamera:      { flex: 1 },
  modalHint: {
    position: 'absolute', top: 60, left: 0, right: 0,
    textAlign: 'center', color: '#fff', fontSize: 15,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 8,
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
  cancelBtnText:    { color: '#fff', fontSize: 15 },
  shutterBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  shutterText:      { fontSize: 28 },
  confirmContainer: {
    flex: 1, backgroundColor: '#111',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  confirmImage: {
    width: 220, height: 220, borderRadius: 16,
    marginBottom: 16, borderWidth: 2, borderColor: '#4ADE80',
  },
  confirmDetected:  { color: '#aaa', fontSize: 13, marginBottom: 8 },
  confirmHint:      { color: '#fff', fontSize: 16, marginBottom: 12, textAlign: 'center' },
  nameInput: {
    width: '100%', borderWidth: 1.5, borderColor: '#4ADE80',
    borderRadius: 12, padding: 14, color: '#fff',
    fontSize: 16, marginBottom: 20, backgroundColor: '#222',
  },
  confirmBtns:      { flexDirection: 'row', gap: 16 },
  retakeBtn: {
    backgroundColor: '#333', borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  retakeBtnText:    { color: '#fff', fontSize: 14 },
  confirmBtn: {
    backgroundColor: '#4ADE80', borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  confirmBtnDisabled: { backgroundColor: '#444' },
  confirmBtnText:   { color: '#111', fontWeight: '700', fontSize: 14 },
});