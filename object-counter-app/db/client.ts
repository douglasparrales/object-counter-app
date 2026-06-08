import * as SQLite from 'expo-sqlite';
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
  `);
}