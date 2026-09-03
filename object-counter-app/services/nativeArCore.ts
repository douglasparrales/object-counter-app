import { NativeModules, Platform } from 'react-native';

export type CompatibilidadArCore = {
  estado: string;
  compatible: boolean;
  transitorio: boolean;
};

type ModuloArCore = {
  comprobarCompatibilidad(): Promise<CompatibilidadArCore>;
  abrirPruebaAnclas(nombre: string): Promise<{ completado: boolean; total: number }>;
};

const modulo = NativeModules.NativeArCore as ModuloArCore | undefined;

export async function comprobarCompatibilidadArCore(): Promise<CompatibilidadArCore> {
  if (Platform.OS !== 'android' || !modulo) {
    return { estado: 'NO_DISPONIBLE', compatible: false, transitorio: false };
  }
  return modulo.comprobarCompatibilidad();
}

export async function abrirPruebaAnclasArCore(nombre: string) {
  if (Platform.OS !== 'android' || !modulo) {
    throw new Error('ARCore nativo no está disponible en este dispositivo.');
  }
  return modulo.abrirPruebaAnclas(nombre);
}
