const DEFAULT_BACKEND_URL = 'http://192.168.1.9:8000';

// Una sola fuente para todos los modos de conteo. Expo reemplaza las variables
// EXPO_PUBLIC_* al crear el bundle, por lo que la IP puede cambiarse sin tocar
// cada pantalla por separado.
export const BACKEND_URL = (
  process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || DEFAULT_BACKEND_URL
).replace(/\/$/, '');
