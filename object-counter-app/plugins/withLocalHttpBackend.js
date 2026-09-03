const { withAndroidManifest } = require('@expo/config-plugins');

/** Permite que la APK se conecte por HTTP a un backend dentro de la red local. */
module.exports = function withLocalHttpBackend(config) {
  return withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (application) {
      application.$ = application.$ || {};
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return modConfig;
  });
};
