import BackButton from '../components/BackButton';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Image, PanResponder, StyleSheet, Text, View } from 'react-native';
import { listarReportes, ReporteGuardado } from '../db/client';
import AppMenu from '../components/AppMenu';

export default function HistoryScreen() {
  const router = useRouter();
  const [reportes, setReportes] = useState<ReporteGuardado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const etiquetaModo = (modo: ReporteGuardado['modoConteo']) => {
    if (modo === 'foto_estatica') return 'Foto';
    if (modo === 'ar_espacial') return 'Escaneo AR';
    return 'Cámara';
  };
  const gestoVolver = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesto) => gesto.dx > 25 && gesto.dx > Math.abs(gesto.dy),
    onPanResponderRelease: (_, gesto) => { if (gesto.dx > 80) router.back(); },
  });

  useFocusEffect(useCallback(() => {
    let activa = true;
    setCargando(true);
    setError('');
    listarReportes()
      .then(data => { if (activa) setReportes(data); })
      .catch(() => { if (activa) setError('No se pudieron cargar los reportes. Vuelve a abrir esta pantalla para reintentar.'); })
      .finally(() => { if (activa) setCargando(false); });
    return () => { activa = false; };
  }, []));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#10151c' }}>
    <View style={styles.container} {...gestoVolver.panHandlers}>
      <View style={styles.header}>
        <Text style={styles.title}>Reportes</Text>
        <Text style={styles.swipeHint}>Consulta tus conteos guardados y sus ubicaciones.</Text>
        <BackButton style={styles.back} onPress={() => router.back()} />
        <View style={styles.menu}><AppMenu /></View>
      </View>
      <FlatList
        data={reportes}
        keyExtractor={(reporte) => String(reporte.id)}
        contentContainerStyle={reportes.length ? styles.list : styles.empty}
        ListEmptyComponent={cargando ? <ActivityIndicator color="#4ADE80" accessibilityLabel="Cargando reportes" /> : (
          <View><Text style={styles.emptyText}>{error || 'Aún no tienes reportes'}</Text>
            {!error && <Text style={styles.emptyHint}>Guarda un conteo para consultarlo aquí.</Text>}
          </View>
        )}
        ListHeaderComponent={reportes.length > 0 && error ? <Text style={styles.emptyText}>{error}</Text> : null}
        renderItem={({ item }) => (
          <View style={styles.card}>
            {item.imagenUri ? <Image source={{ uri: item.imagenUri }} style={styles.image} /> : <View style={styles.placeholder} />}
            <View style={styles.info}>
              <Text style={styles.object}>{item.nombreObjeto || item.claseYolo}</Text>
              <Text style={styles.detail}>{item.ubicacion || 'Sin ubicación'} · {etiquetaModo(item.modoConteo)}</Text>
              <Text style={styles.detail}>{new Date(item.fechaInicio).toLocaleString()}</Text>
              <Text style={styles.total}>{item.totalObjetos} {item.totalObjetos === 1 ? 'objeto' : 'objetos'}</Text>
            </View>
          </View>
        )}
      />
    </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#10151c' },
  header: { paddingTop: 24, paddingHorizontal: 20, paddingBottom: 18, borderBottomWidth: 1, borderColor: '#27303a' },
  back: { position: 'absolute', top: 10, right: 10, width: 38, height: 38, borderRadius: 19, backgroundColor: '#202934', justifyContent: 'center', alignItems: 'center' },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 36 },
  swipeHint: { color: '#9da7b2', fontSize: 12, marginTop: 6 },
  menu: { position: 'absolute', top: 8, left: 10 },
  list: { padding: 16, gap: 12 },
  empty: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { color: '#9da7b2', textAlign: 'center', fontSize: 16 },
  emptyHint: { color: '#87929d', fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 8 },
  card: { flexDirection: 'row', backgroundColor: '#171d25', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#27303a' },
  image: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#27303a' },
  placeholder: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#27303a' },
  info: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  object: { color: '#fff', fontSize: 17, fontWeight: '800' },
  detail: { color: '#9da7b2', fontSize: 12, marginTop: 5 },
  total: { color: '#4ADE80', fontSize: 19, fontWeight: '800', marginTop: 7 },
});
