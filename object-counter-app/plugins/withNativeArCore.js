const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');

const DEPENDENCIA = "implementation 'com.google.ar:core:1.54.0'";
const SINCRONIZACION = `
// Mantener AR actualizado también cuando expo run:android no ejecuta prebuild.
def syncNativeArCoreSources = tasks.register('syncNativeArCoreSources', Copy) {
    from(new File(rootProject.projectDir, '../plugins/native-arcore'))
    include '*.kt'
    into(new File(projectDir, 'src/main/java/com/gokudouglas/objectcounterapp'))
}
tasks.named('preBuild').configure { dependsOn(syncNativeArCoreSources) }
`;

function withDependencia(config) {
  return withAppBuildGradle(config, (modConfig) => {
    if (!modConfig.modResults.contents.includes("tasks.register('syncNativeArCoreSources'")) {
      modConfig.modResults.contents += SINCRONIZACION;
    }
    if (!modConfig.modResults.contents.includes(DEPENDENCIA)) {
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    // ARCore nativo opcional para conteo espacial.\n    ${DEPENDENCIA}`,
      );
    }
    return modConfig;
  });
}

function withManifest(config) {
  return withAndroidManifest(config, (modConfig) => {
    modConfig.modResults.manifest['uses-permission'] ??= [];
    if (!modConfig.modResults.manifest['uses-permission'].some(
      (item) => item.$?.['android:name'] === 'android.permission.INTERNET',
    )) {
      modConfig.modResults.manifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.INTERNET' },
      });
    }
    const application = modConfig.modResults.manifest.application?.[0];
    if (!application) return modConfig;
    // El backend de desarrollo vive normalmente en una IP LAN con HTTP.
    // Sin esta bandera Android puede bloquear tanto fetch como el escaneo AR.
    application.$['android:usesCleartextTraffic'] = 'true';

    application['meta-data'] ??= [];
    const arMeta = application['meta-data'].find(
      (item) => item.$?.['android:name'] === 'com.google.ar.core',
    );
    if (arMeta) arMeta.$['android:value'] = 'optional';
    else application['meta-data'].push({
      $: { 'android:name': 'com.google.ar.core', 'android:value': 'optional' },
    });

    application.activity ??= [];
    if (!application.activity.some(
      (item) => item.$?.['android:name'] === '.NativeArCoreActivity',
    )) {
      application.activity.push({
        $: {
          'android:name': '.NativeArCoreActivity',
          'android:screenOrientation': 'portrait',
          'android:exported': 'false',
        },
      });
    }
    return modConfig;
  });
}

function withPaquete(config) {
  return withMainApplication(config, (modConfig) => {
    const linea = 'add(NativeArCorePackage())';
    if (!modConfig.modResults.contents.includes(linea)) {
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        `PackageList(this).packages.apply {\n              ${linea}`,
      );
    }
    return modConfig;
  });
}

function withFuentes(config) {
  return withDangerousMod(config, ['android', async (modConfig) => {
    const paquete = modConfig.android?.package;
    if (!paquete) throw new Error('[ARCore] Falta expo.android.package en app.json.');
    if (paquete !== 'com.gokudouglas.objectcounterapp') {
      throw new Error(`[ARCore] Las fuentes Kotlin deben actualizarse para el paquete ${paquete}.`);
    }

    const origen = path.join(modConfig.modRequest.projectRoot, 'plugins', 'native-arcore');
    const destino = path.join(
      modConfig.modRequest.platformProjectRoot,
      'app', 'src', 'main', 'java', ...paquete.split('.'),
    );
    fs.mkdirSync(destino, { recursive: true });
    for (const archivo of ['ArDiagnostics.kt', 'ArCameraGate.kt', 'ArCaptureGeometry.kt', 'ArSpatialMap.kt', 'ArDetectionClient.kt', 'NativeArCoreActivity.kt', 'NativeArCoreModule.kt', 'NativeArCorePackage.kt']) {
      fs.copyFileSync(path.join(origen, archivo), path.join(destino, archivo));
    }
    return modConfig;
  }]);
}

module.exports = function withNativeArCore(config) {
  config = withDependencia(config);
  config = withManifest(config);
  config = withPaquete(config);
  return withFuentes(config);
};
