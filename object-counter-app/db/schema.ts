// db/schema.ts
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';

export const sesiones = sqliteTable('sesiones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fechaInicio: text('fecha_inicio').notNull(),
  fechaFin: text('fecha_fin'),
  imagenUri: text('imagen_uri'),
  notas: text('notas'),
  totalObjetos: integer('total_objetos').default(0),
  estado: text('estado').notNull().default('guardado'),
  nombreObjeto: text('nombre_objeto').notNull().default(''),
  claseYolo: text('clase_yolo').notNull().default(''),
  ubicacion: text('ubicacion').notNull().default(''),
});

export const resultados = sqliteTable('resultados', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sesionId: integer('sesion_id')
    .notNull()
    .references(() => sesiones.id, { onDelete: 'cascade' }),
  claseObjeto: text('clase_objeto').notNull(),
  cantidad: integer('cantidad').notNull().default(0),
  confianzaPromedio: real('confianza_promedio').default(0),
});

export const categoriasPersonalizadas = sqliteTable('categorias_personalizadas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  etiqueta: text('etiqueta').notNull(),
  imagenReferenciaUri: text('imagen_referencia_uri'),
  fechaCreacion: text('fecha_creacion').notNull(),
});

export const auditoriaSesiones = sqliteTable('auditoria_sesiones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sesionId: integer('sesion_id')
    .notNull()
    .references(() => sesiones.id, { onDelete: 'cascade' }),
  evento: text('evento').notNull(),
  detalle: text('detalle'),
  fecha: text('fecha').notNull(),
});
