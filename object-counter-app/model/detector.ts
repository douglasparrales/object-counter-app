export const COCO_CLASSES = [
  'persona','bicicleta','carro','moto','avion','bus','tren','camion','barco',
  'semaforo','boca_de_incendio','senal_stop','parquimetro','banco','pajaro',
  'gato','perro','caballo','oveja','vaca','elefante','oso','cebra','jirafa',
  'mochila','sombrilla','bolso','corbata','maleta','frisbee','esquis',
  'snowboard','balon','cometa','bate','guante','patineta','tabla_surf',
  'raqueta','botella','copa','taza','tenedor','cuchillo','cuchara','tazon',
  'banana','manzana','sandwich','naranja','brocoli','zanahoria','perro_caliente',
  'pizza','dona','pastel','silla','sofa','planta','cama','mesa_comedor',
  'inodoro','tv','laptop','mouse','control','teclado','telefono','microondas',
  'horno','tostadora','fregadero','refrigerador','libro','reloj','florero',
  'tijeras','oso_de_peluche','secador','cepillo_de_dientes'
];

export type Detection = {
  clase: string;
  confianza: number;
};

const CONFIDENCE_THRESHOLD = 0.45;
const NUM_DETECTIONS = 8400;
const NUM_CLASSES = 80;

export function runDetection(output: Float32Array): Detection[] {
  'worklet';

  const detections: Detection[] = [];

  for (let i = 0; i < NUM_DETECTIONS; i++) {
    let maxConf = 0;
    let maxClass = 0;

    for (let c = 0; c < NUM_CLASSES; c++) {
      const conf = output[(4 + c) * NUM_DETECTIONS + i];

      if (conf > maxConf) {
        maxConf = conf;
        maxClass = c;
      }
    }

    if (maxConf < CONFIDENCE_THRESHOLD) continue;

    detections.push({
      clase: COCO_CLASSES[maxClass],
      confianza: maxConf,
    });
  }

  return detections;
}