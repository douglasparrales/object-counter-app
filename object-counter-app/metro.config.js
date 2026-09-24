const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// soporte para archivos .tflite
config.resolver.assetExts.push('tflite');

// Python environments and model exports are not JavaScript inputs. Exclude
// them from Metro's initial crawl and watcher, especially on Windows.
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList)
    ? existingBlockList
    : existingBlockList ? [existingBlockList] : []),
  /[/\\](?:yolovenv|Ultralytics|yolov8n_saved_model)[/\\]/,
];

module.exports = config;
