import { useRef, useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, Pressable, TouchableOpacity,
  Image, ActivityIndicator, Modal, TextInput, Alert,
  useWindowDimensions,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import {
  useDetection,
  CajaGuardada,
} from '../hooks/useDetection';
import ARView from '../components/ARView';

function BoundingBox({
  caja,
  screenW,
  screenH,
}: {
  caja: CajaGuardada;
  screenW: number;
  screenH: number;
}) {
  const boxW = caja.w * screenW;
  const boxH = caja.h * screenH;
  const left = (caja.cx - caja.w / 2) * screenW;
  const top  = (caja.cy - caja.h / 2) * screenH;

  return (
    <View
      style={{
        position: 'absolute',
        left,
        top,
        width: boxW,
        height: boxH,
        borderWidth: 2.5,
        borderColor: '#4ADE80',
        borderRadius: 6,
        backgroundColor: 'rgba(74, 222, 128, 0.12)',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: -22,
          left: -2,
          backgroundColor: '#4ADE80',
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 4,
        }}
      >
        <Text style={{ color: '#111', fontSize: 11, fontWeight: '800' }}>
          #{caja.id} {caja.clase}
        </Text>
      </View>
    </View>
  );
}

// Etapas del modal de referencia
type EtapaModal = 'camara' | 'nombrar' | 'identificando' | 'resultado';

const RETRASO_LIBERACION_CAMARA_MS = 700; // tiempo para que Android suelte el sensor antes de que Viro lo tome

export default function CameraScreen() {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { hasPermission, requestPermission } = useCameraPermission();
  const [facing, setFacing]     = useState<'back' | 'front'>('back');
  const device                  = useCameraDevice(facing);
  const cameraRef               = useRef<Camera>(null);
  const modalCameraRef          = useRef<Camera>(null);

  const [modalVisible, setModalVisible]     = useState(false);
  const [etapa, setEtapa]                   = useState<EtapaModal>('camara');
  const [fotoCapturada, setFotoCapturada]   = useState<string | null>(null);
  const [nombreUsuario, setNombreUsuario]   = useState('');
  const [claseYoloLocal, setClaseYoloLocal] = useState<string | null>(null);
  const [confianzaLocal, setConfianzaLocal] = useState<number | null>(null);
  const [capturando, setCapturando]         = useState(false);
  const [preparandoAR, setPreparandoAR]     = useState(false); // 👉 nuevo: transición antes de montar Viro

  const {
    totalContado,
    cajasGuardadas,
    isDetecting,
    objetoReferencia,
    identificando,
    confirmarObjeto,
    identificarFoto,
    startDetection,
    stopDetection,
    limpiarReferencia,
  } = useDetection();

  const abrirModalReferencia = () => {
    setEtapa('camara');
    setFotoCapturada(null);
    setNombreUsuario('');
    setClaseYoloLocal(null);
    setConfianzaLocal(null);
    setModalVisible(true);
  };

  const tomarFotoEnModal = async () => {
    if (!modalCameraRef.current || capturando) return;
    setCapturando(true);
    try {
      const photo = await modalCameraRef.current.takePhoto();
      const uri   = `file://${photo.path}`;
      setFotoCapturada(uri);
      setEtapa('nombrar');
    } catch {
      Alert.alert('Error', 'No se pudo tomar la foto');
    } finally {
      setCapturando(false);
    }
  };

  const retomarFoto = () => {
    setFotoCapturada(null);
    setClaseYoloLocal(null);
    setConfianzaLocal(null);
    setEtapa('camara');
  };

  const confirmarNombreYBuscar = async () => {
    const nombre = nombreUsuario.trim();
    if (!nombre || !fotoCapturada) return;

    setEtapa('identificando');
    try {
      const resultado = await identificarFoto(fotoCapturada, nombre);
      setClaseYoloLocal(resultado?.clase ?? null);
      setConfianzaLocal(resultado?.confianza ?? null);
    } catch {
      Alert.alert('Error', 'No se pudo identificar el objeto. Intenta de nuevo.');
    } finally {
      setEtapa('resultado');
    }
  };

  const confirmarFinal = () => {
    if (!fotoCapturada) return;
    const nombre = nombreUsuario.trim();
    const clase  = claseYoloLocal || nombre;
    confirmarObjeto(clase, nombre, fotoCapturada);
    setModalVisible(false);
  };

  // 👉 Ya NO se llama a startDetection directo desde el botón.
  // Primero se desmonta vision-camera (preparandoAR=true quita el <Camera>)
  // y solo tras un pequeño respiro se le entrega el sensor a Viro.
  const iniciarConteoAR = () => {
    setPreparandoAR(true);
  };

  useEffect(() => {
    if (!preparandoAR) return;
    const timer = setTimeout(() => {
      startDetection(cameraRef);
      setPreparandoAR(false);
    }, RETRASO_LIBERACION_CAMARA_MS);
    return () => clearTimeout(timer);
  }, [preparandoAR, startDetection]);

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

  // Pantalla de transición: la cámara normal ya está desmontada,
  // Viro todavía no se monta. Evita el choque por el sensor.
  if (preparandoAR) {
    return (
      <View style={[styles.centered, { backgroundColor: '#000' }]}>
        <ActivityIndicator size="large" color="#4ADE80" />
        <Text style={[styles.message, { marginTop: 16 }]}>Preparando cámara AR...</Text>
      </View>
    );
  }

  if (isDetecting) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <ARView objetoReferencia={objetoReferencia} onDetener={stopDetection} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={styles.camera}
        device={device}
        isActive={!modalVisible && !isDetecting && !preparandoAR}
        photo={true}
      />

      {isDetecting &&
        cajasGuardadas.map((caja) => (
          <BoundingBox key={`caja-${caja.id}`} caja={caja} screenW={screenW} screenH={screenH} />
        ))}

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

      {isDetecting && (
        <View style={styles.totalBadge}>
          <Text style={styles.totalLabel}>{objetoReferencia?.nombreUsuario ?? 'Objetos'}</Text>
          <Text style={styles.totalNum}>{totalContado}</Text>
        </View>
      )}

      <View style={styles.controls}>
        <TouchableOpacity style={styles.flipBtn} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
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
          style={[styles.captureBtn, isDetecting && styles.captureBtnActive, !objetoReferencia && styles.disabledBtn]}
          onPress={isDetecting ? stopDetection : iniciarConteoAR}
          disabled={!objetoReferencia && !isDetecting}
        >
          <Text style={styles.captureText}>{isDetecting ? 'Detener' : 'Contar'}</Text>
        </Pressable>
      </View>

      {/* MODAL DE REFERENCIA */}
      <Modal visible={modalVisible} animationType="slide">
        <View style={styles.modalContainer}>

          {etapa === 'camara' && (
            <>
              <Camera
                ref={modalCameraRef}
                style={styles.modalCamera}
                device={device}
                isActive={modalVisible && etapa === 'camara'}
                photo={true}
              />
              <Text style={styles.modalHint}>Encuadra el objeto que quieres contar</Text>
              <View style={styles.modalControls}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shutterBtn} onPress={tomarFotoEnModal} disabled={capturando}>
                  {capturando ? <ActivityIndicator color="#111" /> : <Text style={styles.shutterText}>📸</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}

          {etapa === 'nombrar' && fotoCapturada && (
            <View style={styles.confirmContainer}>
              <Image source={{ uri: fotoCapturada }} style={styles.confirmImage} />
              <Text style={styles.confirmHint}>¿Cómo se llama este objeto?</Text>
              <TextInput
                style={styles.nameInput}
                placeholder="Ej: tomate, llave, zanahoria..."
                placeholderTextColor="#999"
                value={nombreUsuario}
                onChangeText={setNombreUsuario}
                autoFocus
              />
              <View style={styles.confirmBtns}>
                <TouchableOpacity style={styles.retakeBtn} onPress={retomarFoto}>
                  <Text style={styles.retakeBtnText}>🔄 Retomar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, !nombreUsuario.trim() && styles.confirmBtnDisabled]}
                  onPress={confirmarNombreYBuscar}
                  disabled={!nombreUsuario.trim()}
                >
                  <Text style={styles.confirmBtnText}>✅ Confirmar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {etapa === 'identificando' && fotoCapturada && (
            <View style={styles.confirmContainer}>
              <Image source={{ uri: fotoCapturada }} style={styles.confirmImage} />
              <ActivityIndicator size="large" color="#185FA5" style={{ marginTop: 20 }} />
              <Text style={styles.confirmHint}>Buscando "{nombreUsuario}"...</Text>
            </View>
          )}

          {etapa === 'resultado' && fotoCapturada && (
            <View style={styles.confirmContainer}>
              <View>
                <Image source={{ uri: fotoCapturada }} style={styles.confirmImage} />
                <View style={styles.yoloBadge}>
                  <Text style={styles.yoloBadgeText}>
                    {claseYoloLocal
                      ? `YOLO: ${claseYoloLocal}${confianzaLocal ? ` (${Math.round(confianzaLocal * 100)}%)` : ''}`
                      : '⚠️ No identificado'}
                  </Text>
                </View>
              </View>
              <Text style={styles.confirmHint}>Nombre elegido: "{nombreUsuario}"</Text>
              <View style={styles.confirmBtns}>
                <TouchableOpacity style={styles.retakeBtn} onPress={retomarFoto}>
                  <Text style={styles.retakeBtnText}>🔄 Retomar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={confirmarFinal}>
                  <Text style={styles.confirmBtnText}>✅ Usar como referencia</Text>
                </TouchableOpacity>
              </View>
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
  message:          { fontSize: 16, textAlign: 'center', color: '#fff' },
  referenceBox: {
    position: 'absolute', top: 50, right: 16,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 12, padding: 8, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#4ADE80', maxWidth: 100,
  },
  referenceImage:   { width: 64, height: 64, borderRadius: 8, marginBottom: 4 },
  referenceText:    { color: '#4ADE80', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  clearBtn: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 10, width: 18, height: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  clearBtnText:     { color: '#fff', fontSize: 10 },
  totalBadge: {
    position: 'absolute', top: 50, left: 16,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 16, paddingHorizontal: 20, paddingVertical: 12,
    borderWidth: 1.5, borderColor: '#4ADE80', alignItems: 'center',
  },
  totalLabel:       { color: '#aaa', fontSize: 11, marginBottom: 2 },
  totalNum:         { color: '#4ADE80', fontSize: 42, fontWeight: '800', lineHeight: 46 },
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
    backgroundColor: '#4ADE80',
    justifyContent: 'center', alignItems: 'center',
  },
  captureBtnActive: { backgroundColor: '#EF4444' },
  disabledBtn:      { backgroundColor: '#444' },
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
  yoloBadge: {
    position: 'absolute', bottom: 24, left: 0, right: 0,
    marginHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10,
    borderWidth: 1, borderColor: '#4ADE80',
  },
  yoloBadgeText: { color: '#4ADE80', fontSize: 12, fontWeight: '700', textAlign: 'center' },
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