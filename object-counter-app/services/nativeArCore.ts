import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { getBackendUrl } from '../config/backend';

export type CompatibilidadArCore = {
  estado: string;
  compatible: boolean;
  transitorio: boolean;
  versionNativa?: string;
};

type ModuloArCore = {
  comprobarCompatibilidad(): Promise<CompatibilidadArCore>;
  abrirConteo(
    nombre: string,
    clase: string,
    referenciaId: string | null,
    backendUrl: string,
  ): Promise<{ completado: boolean; total: number }>;
};

const modulo = NativeModules.NativeArCore as ModuloArCore | undefined;

export async function comprobarCompatibilidadArCore(): Promise<CompatibilidadArCore> {
  if (Platform.OS !== 'android' || !modulo) {
    return { estado: 'NO_DISPONIBLE', compatible: false, transitorio: false };
  }
  let resultado = await modulo.comprobarCompatibilidad();
  // ARCore puede devolver UNKNOWN_CHECKING mientras consulta Play Services.
  // Abrir la Activity en ese estado produce un fallo intermitente en equipos
  // compatibles; esperamos brevemente antes de tomar una decisión definitiva.
  for (let intento = 0; resultado.transitorio && intento < 4; intento += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    resultado = await modulo.comprobarCompatibilidad();
  }
  if (resultado.compatible && resultado.versionNativa !== '2026.09.22.2') {
    throw new Error('El módulo AR instalado está desactualizado. Compila e instala Android nuevamente; recargar Metro no actualiza AR. Se necesita AR 2026.09.22.2.');
  }
  return resultado;
}

export async function abrirConteoArCore(
  nombre: string,
  clase: string,
  referenciaId: string | null,
) {
  if (Platform.OS !== 'android' || !modulo) {
    throw new Error('ARCore nativo no está disponible en este dispositivo.');
  }
  const diagnosticos = DeviceEventEmitter.addListener('ArDiagnostico', (mensaje: string) => {
    console.log('[AR diagnóstico]', mensaje);
  });
  try {
    return await modulo.abrirConteo(nombre, clase, referenciaId, await getBackendUrl());
  } finally {
    diagnosticos.remove();
  }
}
