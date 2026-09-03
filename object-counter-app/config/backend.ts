// const DEFAULT_BACKEND_URL = 'http://192.168.1.9:8000';

// // Una sola fuente para todos los modos de conteo. Expo reemplaza las variables
// // EXPO_PUBLIC_* al crear el bundle, por lo que la IP puede cambiarse sin tocar
// // cada pantalla por separado.
// export const BACKEND_URL = (
//   process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || DEFAULT_BACKEND_URL
// ).replace(/\/$/, '');


import AsyncStorage from '@react-native-async-storage/async-storage';

const IP_KEY = 'user_backend_ip';

// Tu IP por defecto actual
const DEFAULT_BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || 'https://object-counter-app-backend.onrender.com';

// Obtiene la IP guardada en el teléfono o usa la por defecto
export const getBackendUrl = async (): Promise<string> => {
  try {
    const savedIp = await AsyncStorage.getItem(IP_KEY);
    const url = savedIp || DEFAULT_BACKEND_URL;
    return url.replace(/\/$/, ''); // Elimina la barra final si existe
  } catch {
    return DEFAULT_BACKEND_URL.replace(/\/$/, '');
  }
};

// Guarda la nueva IP ingresada por el usuario
export const setBackendUrl = async (newUrl: string): Promise<void> => {
  try {
    let formattedUrl = newUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `http://${formattedUrl}`;
    }
    await AsyncStorage.setItem(IP_KEY, formattedUrl);
  } catch (error) {
    console.error('Error al guardar la URL del backend:', error);
  }
};