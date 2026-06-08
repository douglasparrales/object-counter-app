import { db } from './client';
import { sesiones } from './schema';

export async function testDB() {
  try {
    await db.select().from(sesiones);
    console.log('✅ Base de datos OK');
  } catch (e) {
    console.error('❌ Error en DB:', e);
  }
}