import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

const sqlite = SQLite.openDatabaseSync('object_counter.db');
export const db = drizzle(sqlite, { schema });

export async function initDB() {
  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS sesiones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha_inicio TEXT NOT NULL,
      fecha_fin TEXT,
      imagen_uri TEXT,
      notas TEXT,
      total_objetos INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS resultados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sesion_id INTEGER NOT NULL,
      clase_objeto TEXT NOT NULL,
      cantidad INTEGER DEFAULT 0,
      confianza_promedio REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS auditoria_sesiones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sesion_id INTEGER NOT NULL,
      evento TEXT NOT NULL,
      detalle TEXT,
      fecha TEXT NOT NULL,
      FOREIGN KEY (sesion_id) REFERENCES sesiones(id) ON DELETE CASCADE
    );
  `);

  // Migración segura para instalaciones que ya tenían la primera tabla.
  const columnas = await sqlite.getAllAsync<{ name: string }>('PRAGMA table_info(sesiones)');
  const existentes = new Set(columnas.map((columna) => columna.name));
  const nuevasColumnas = [
    ['estado', "TEXT NOT NULL DEFAULT 'guardado'"],
    ['nombre_objeto', "TEXT NOT NULL DEFAULT ''"],
    ['clase_yolo', "TEXT NOT NULL DEFAULT ''"],
    ['ubicacion', "TEXT NOT NULL DEFAULT ''"],
    ['modo_conteo', "TEXT NOT NULL DEFAULT 'tiempo_real'"],
  ] as const;
  for (const [nombre, definicion] of nuevasColumnas) {
    if (!existentes.has(nombre)) await sqlite.execAsync(`ALTER TABLE sesiones ADD COLUMN ${nombre} ${definicion}`);
  }
}

export type ReporteGuardado = {
  id: number;
  fechaInicio: string;
  fechaFin: string | null;
  imagenUri: string | null;
  nombreObjeto: string;
  claseYolo: string;
  ubicacion: string;
  modoConteo: 'tiempo_real' | 'foto_estatica';
  totalObjetos: number;
};

export async function guardarReporte(datos: Omit<ReporteGuardado, 'id'>) {
  const resultado = await sqlite.runAsync(
    `INSERT INTO sesiones (fecha_inicio, fecha_fin, imagen_uri, nombre_objeto, clase_yolo, ubicacion, modo_conteo, total_objetos, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'guardado')`,
    datos.fechaInicio, datos.fechaFin, datos.imagenUri, datos.nombreObjeto,
    datos.claseYolo, datos.ubicacion, datos.modoConteo, datos.totalObjetos,
  );
  await sqlite.runAsync(
    'INSERT INTO auditoria_sesiones (sesion_id, evento, detalle, fecha) VALUES (?, ?, ?, ?)',
    resultado.lastInsertRowId, 'REPORTE_GUARDADO', `Total: ${datos.totalObjetos}`, new Date().toISOString(),
  );
  await sqlite.runAsync(
    'INSERT INTO resultados (sesion_id, clase_objeto, cantidad, confianza_promedio) VALUES (?, ?, ?, ?)',
    resultado.lastInsertRowId, datos.claseYolo || datos.nombreObjeto, datos.totalObjetos, 0,
  );
  return resultado.lastInsertRowId;
}

// Las fotos de VisionCamera pueden vivir en caché. Copiarlas a documentos
// mantiene la evidencia disponible para el historial y la auditoría.
export async function persistirImagenReferencia(uri: string) {
  if (!FileSystem.documentDirectory || !uri.startsWith('file://')) return uri;
  const destino = `${FileSystem.documentDirectory}referencia-${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: destino });
  return destino;
}

export async function listarReportes() {
  return sqlite.getAllAsync<ReporteGuardado>(`
    SELECT id, fecha_inicio AS fechaInicio, fecha_fin AS fechaFin, imagen_uri AS imagenUri,
           nombre_objeto AS nombreObjeto, clase_yolo AS claseYolo, ubicacion, modo_conteo AS modoConteo, total_objetos AS totalObjetos
    FROM sesiones WHERE estado = 'guardado' ORDER BY fecha_inicio DESC
  `);
}
