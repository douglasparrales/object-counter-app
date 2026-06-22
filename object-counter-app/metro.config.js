const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// soporte para archivos .tflite
config.resolver.assetExts.push('tflite');

module.exports = config;