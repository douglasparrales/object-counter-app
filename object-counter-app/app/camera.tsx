import { useMemo, useRef, useState } from 'react';
import {
  StyleSheet, View, Text, Pressable, TouchableOpacity,
  Image, ActivityIndicator, Modal, TextInput, Alert,
  useWindowDimensions, PanResponder,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useRouter } from 'expo-router';
import { guardarReporte, persistirImagenReferencia } from '../db/client';
import {
  useDetection,
  CajaGuardada,
} from '../hooks/useDetection';

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

export default function CameraScreen() {
  const router = useRouter();
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
  const [referenciaIdLocal, setReferenciaIdLocal] = useState<string | null>(null);
  const [capturando, setCapturando]         = useState(false);
  const [resultadoFinal, setResultadoFinal] = useState<number | null>(null);
  const [ubicacion, setUbicacion]           = useState('');
  const [guardando, setGuardando]           = useState(false);
  const [guardado, setGuardado]             = useState(false);

  const {
    totalContado,
    cajasGuardadas,
    isDetecting,
    objetoReferencia,
    identificando,
    confirmarObjeto,
    identificarFoto,
    startDetection,
    contarFotoMasiva,
    stopDetection,
    limpiarReferencia,
  } = useDetection();

  const gestoHistorial = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesto) => Math.abs(gesto.dx) > 25 && Math.abs(gesto.dx) > Math.abs(gesto.dy),
    onPanResponderRelease: (_, gesto) => {
      if (gesto.dx < -80) router.push('/history');
    },
  }), [router]);

  const abrirModalReferencia = () => {
    setEtapa('camara');
    setFotoCapturada(null);
    setNombreUsuario('');
    setClaseYoloLocal(null);
    setConfianzaLocal(null);
    setReferenciaIdLocal(null);
    setModalVisible(true);
  };

  const tomarFotoEnModal = async () => {
    if (!modalCameraRef.current || capturando) return;
    console.log('[Camera] Capturando foto de referencia...');
    setCapturando(true);
    try {
      const photo = await modalCameraRef.current.takePhoto();
      const uri   = `file://${photo.path}`;
      console.log('[Camera] Foto de referencia capturada:', uri);
      setFotoCapturada(uri);
      setEtapa('nombrar');
    } catch (error) {
      console.log('[Camera] Error capturando foto de referencia:', error);
      Alert.alert('Error', 'No se pudo tomar la foto');
    } finally {
      setCapturando(false);
    }
  };

  const retomarFoto = () => {
    setFotoCapturada(null);
    setClaseYoloLocal(null);
    setConfianzaLocal(null);
    setReferenciaIdLocal(null);
    setEtapa('camara');
  };

  const confirmarNombreYBuscar = async () => {
    const nombre = nombreUsuario.trim();
    if (!nombre || !fotoCapturada) return;

    setEtapa('identificando');
    console.log(`[YOLO] Identificando referencia: "${nombre}"`);
    try {
      const resultado = await identificarFoto(fotoCapturada, nombre);
      setClaseYoloLocal(resultado?.clase ?? null);
      setConfianzaLocal(resultado?.confianza ?? null);
      setReferenciaIdLocal(resultado?.referenciaId ?? null);
      console.log('[YOLO] Resultado de referencia:', resultado);
    } catch (error) {
      console.log('[YOLO] Error identificando referencia:', error);
      Alert.alert('Error', 'No se pudo identificar el objeto. Intenta de nuevo.');
    } finally {
      setEtapa('resultado');
    }
  };

  const confirmarFinal = () => {
    if (!fotoCapturada) return;
    const nombre = nombreUsuario.trim();
    const clase  = claseYoloLocal || nombre;
    confirmarObjeto(clase, nombre, fotoCapturada, referenciaIdLocal);
    console.log(`[Conteo] Referencia confirmada: nombre="${nombre}", clase="${clase}"`);
    setModalVisible(false);
  };

  const iniciarConteo = () => {
    console.log('[Conteo] Iniciando cámara y tracking.');
    startDetection(cameraRef);
  };

  const iniciarFotoMasiva = async () => {
    const total = await contarFotoMasiva(cameraRef);
    setResultadoFinal(total);
    setUbicacion('');
    setGuardado(false);
  };

  const elegirModoConteo = () => {
    Alert.alert('¿Cómo quieres contar?', 'Tiempo real para objetos separados. Foto masiva para muchos objetos pequeños o juntos.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tiempo real', onPress: iniciarConteo },
      { text: 'Foto masiva', onPress: iniciarFotoMasiva },
    ]);
  };

  const finalizarConteo = () => {
    const totalFinal = stopDetection();
    setResultadoFinal(totalFinal);
    setUbicacion('');
    setGuardado(false);
  };

  const guardarConteo = async () => {
    if (!objetoReferencia || resultadoFinal === null || guardando) return;
    setGuardando(true);
    try {
      const imagenPersistente = await persistirImagenReferencia(objetoReferencia.imagenUri);
      await guardarReporte({
        fechaInicio: new Date().toISOString(),
        fechaFin: new Date().toISOString(),
        imagenUri: imagenPersistente,
        nombreObjeto: objetoReferencia.nombreUsuario,
        claseYolo: objetoReferencia.claseYolo,
        ubicacion: ubicacion.trim(),
        totalObjetos: resultadoFinal,
      });
      setGuardado(true);
      console.log('[Reporte] Conteo guardado con auditoría.');
    } catch (error) {
      console.log('[Reporte] Error guardando conteo:', error);
      Alert.alert('Error', 'No se pudo guardar el reporte.');
    } finally {
      setGuardando(false);
    }
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
    <View style={styles.container} {...gestoHistorial.panHandlers}>
      <Camera
        ref={cameraRef}
        style={styles.camera}
        device={device}
        isActive={!modalVisible}
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
          {resultadoFinal !== null && (
            <Text style={styles.referenceCount}>{resultadoFinal} contados</Text>
          )}
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
          <TouchableOpacity style={styles.flipBtn} onPress={() => router.push('/history')}>
            <Text style={styles.flipText}>Reportes →</Text>
          </TouchableOpacity>
        )}

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
          onPress={isDetecting ? finalizarConteo : elegirModoConteo}
          disabled={!objetoReferencia && !isDetecting}
        >
          <Text style={styles.captureText}>{isDetecting ? 'Detener' : 'Contar'}</Text>
        </Pressable>
      </View>

      {resultadoFinal !== null && (
        <View style={styles.historyHint}>
          <Text style={styles.historyHintText}>Reportes: toca “Reportes →” o desliza hacia la izquierda</Text>
        </View>
      )}

      <Modal visible={resultadoFinal !== null} transparent animationType="fade" onRequestClose={() => setResultadoFinal(null)}>
        <View style={styles.resultOverlay}>
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>{guardado ? '✓ Conteo guardado' : 'Conteo finalizado'}</Text>
            <Text style={styles.resultNumber}>{resultadoFinal ?? 0}</Text>
            <Text style={styles.resultLabel}>{objetoReferencia?.nombreUsuario ?? 'objetos'} contados</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Lugar: Lab 1, sala, bodega..."
              placeholderTextColor="#999"
              value={ubicacion}
              onChangeText={setUbicacion}
              editable={!guardado}
            />
            {!guardado ? (
              <View style={styles.confirmBtns}>
                <TouchableOpacity style={styles.retakeBtn} onPress={() => setResultadoFinal(null)}>
                  <Text style={styles.retakeBtnText}>Ahora no</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={guardarConteo} disabled={guardando}>
                  {guardando ? <ActivityIndicator color="#111" /> : <Text style={styles.confirmBtnText}>Guardar</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.confirmBtn} onPress={() => setResultadoFinal(null)}>
                <Text style={styles.confirmBtnText}>Listo</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

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
              <Text style={styles.confirmHint}>Reconociendo "{nombreUsuario}"...</Text>
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
  referenceCount:   { color: '#fff', fontSize: 11, marginTop: 3, fontWeight: '800' },
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
  historyHint: {
    position: 'absolute', bottom: 132, left: 24, right: 24,
    alignItems: 'center',
  },
  historyHintText: { color: '#fff', fontSize: 12, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
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
  resultOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: 24 },
  resultCard: { backgroundColor: '#171d25', borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#4ADE80' },
  resultTitle: { color: '#4ADE80', fontSize: 19, fontWeight: '800' },
  resultNumber: { color: '#fff', fontSize: 64, fontWeight: '800', marginTop: 8 },
  resultLabel: { color: '#b7c0c9', fontSize: 15, marginBottom: 20 },
});
