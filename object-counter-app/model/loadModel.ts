import { loadTensorflowModel } from 'react-native-fast-tflite';

export async function loadYOLOModel() {
  try {
    const model = await loadTensorflowModel(
      require('../assets/yolov8n_float16.tflite'),
      []
    );

    console.log('✅ Modelo YOLO cargado correctamente');
    console.log('Inputs:', model.inputs);
    console.log('Outputs:', model.outputs);

    return model;
  } catch (error) {
    console.error('❌ Error cargando modelo:', error);
  }
}