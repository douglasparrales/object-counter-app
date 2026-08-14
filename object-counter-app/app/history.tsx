import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { FlatList, Image, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { listarReportes, ReporteGuardado } from '../db/client';
import AppMenu from '../components/AppMenu';

export default function HistoryScreen() {
  const router = useRouter();
  const [reportes, setReportes] = useState<ReporteGuardado[]>([]);
  const gestoVolver = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesto) => gesto.dx > 25 && gesto.dx > Math.abs(gesto.dy),
    onPanResponderRelease: (_, gesto) => { if (gesto.dx > 80) router.back(); },
  });

  useFocusEffect(useCallback(() => {
    listarReportes()
      .then(setReportes)
      .catch((error) => console.log('[Historial] Error cargando reportes:', error));
  }, []));

  return (
    <View style={styles.container} {...gestoVolver.panHandlers}>
      <View style={styles.header}>
        <Text style={styles.title}>Reportes</Text>
        <Text style={styles.swipeHint}>También puedes deslizar hacia la derecha para volver.</Text>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <View style={styles.menu}><AppMenu /></View>
      </View>
      <FlatList
        data={reportes}
        keyExtractor={(reporte) => String(reporte.id)}
        contentContainerStyle={reportes.length ? styles.list : styles.empty}
        ListEmptyComponent={<Text style={styles.emptyText}>Aún no hay conteos guardados.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            {item.imagenUri ? <Image source={{ uri: item.imagenUri }} style={styles.image} /> : <View style={styles.placeholder} />}
            <View style={styles.info}>
              <Text style={styles.object}>{item.nombreObjeto || item.claseYolo}</Text>
              <Text style={styles.detail}>{item.ubicacion || 'Sin ubicación'} · {item.modoConteo === 'foto_estatica' ? 'Foto estática' : 'Tiempo real'}</Text>
              <Text style={styles.detail}>{new Date(item.fechaInicio).toLocaleString()}</Text>
              <Text style={styles.total}>{item.totalObjetos} objetos</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#10151c' },
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 18, borderBottomWidth: 1, borderColor: '#27303a' },
  back: { position: 'absolute', top: 56, right: 10, width: 38, height: 38, borderRadius: 19, backgroundColor: '#202934', justifyContent: 'center', alignItems: 'center' },
  backText: { color: '#fff', fontSize: 34, lineHeight: 34 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 36 },
  swipeHint: { color: '#9da7b2', fontSize: 12, marginTop: 6 },
  menu: { position: 'absolute', top: 52, left: 10 },
  list: { padding: 16, gap: 12 },
  empty: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { color: '#9da7b2', textAlign: 'center', fontSize: 16 },
  card: { flexDirection: 'row', backgroundColor: '#171d25', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#27303a' },
  image: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#27303a' },
  placeholder: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#27303a' },
  info: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  object: { color: '#fff', fontSize: 17, fontWeight: '800' },
  detail: { color: '#9da7b2', fontSize: 12, marginTop: 5 },
  total: { color: '#4ADE80', fontSize: 19, fontWeight: '800', marginTop: 7 },
});
