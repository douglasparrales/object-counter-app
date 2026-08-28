const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

module.exports = function withCounterArModel(config) {
  return withDangerousMod(config, ['android', async (modConfig) => {
    const origen = path.join(modConfig.modRequest.projectRoot, 'assets', 'models', 'yoloe-counter-ar.onnx');
    const destino = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets', 'yoloe-counter-ar.onnx');
    if (fs.existsSync(origen)) {
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.copyFileSync(origen, destino);
    } else {
      console.warn('[AR model] Falta assets/models/yoloe-counter-ar.onnx; ejecuta el exportador del backend.');
    }
    return modConfig;
  }]);
};
