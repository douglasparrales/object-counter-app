import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL_KEY = 'user_backend_ip';
const DEFAULT_BACKEND_PORT = '8000';
const DEFAULT_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || '';

/** Convierte una IP sola o una URL completa a la URL base usada por la app. */
export function normalizeBackendUrl(value: string): string {
  const input = value.trim();
  if (!input) throw new Error('Ingresa la IP del computador o la URL del backend.');

  const withProtocol = /^https?:\/\//i.test(input) ? input : `http://${input}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error('La dirección no es válida. Ejemplo: 192.168.1.25');
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('La dirección debe usar http o https.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Ingresa solamente la dirección del servidor, sin credenciales ni parámetros.');
  }

  if (!parsed.port && parsed.protocol === 'http:') parsed.port = DEFAULT_BACKEND_PORT;
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  return parsed.toString().replace(/\/$/, '');
}

export async function getBackendUrl(): Promise<string> {
  const savedUrl = await AsyncStorage.getItem(BACKEND_URL_KEY);
  const configuredUrl = savedUrl || DEFAULT_BACKEND_URL;
  return configuredUrl ? normalizeBackendUrl(configuredUrl) : '';
}

export async function setBackendUrl(newUrl: string): Promise<string> {
  const normalizedUrl = normalizeBackendUrl(newUrl);
  await AsyncStorage.setItem(BACKEND_URL_KEY, normalizedUrl);
  return normalizedUrl;
}

export async function checkBackendConnection(value: string): Promise<void> {
  const url = normalizeBackendUrl(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${url}/health`, { signal: controller.signal });
    if (!response.ok) throw new Error(`El servidor respondió con estado ${response.status}.`);
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error('El servidor no respondió en 8 segundos.');
    throw new Error(error?.message || 'No se pudo conectar con el servidor.');
  } finally {
    clearTimeout(timeout);
  }
}
