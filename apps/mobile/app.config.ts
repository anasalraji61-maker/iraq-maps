import type { ExpoConfig } from 'expo/config';

// EXPO_PUBLIC_* values ship inside the APK: never put a secret there.
const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';

const config: ExpoConfig = {
  name: 'خرائط العراق',
  slug: 'iraq-maps',
  scheme: 'iraqmaps',
  version: '0.1.0',
  orientation: 'portrait',
  android: { package: 'iq.iraqmaps.app' },
  ios: { bundleIdentifier: 'iq.iraqmaps.app' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    ['expo-localization', { supportsRTL: true }],
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 26,
          // Non-production builds reach the API over plain HTTP: the e2e emulator (http://10.0.2.2:3000) and a dev phone
          // on a LAN IP. Production stays HTTPS-only.
          usesCleartextTraffic: appEnv !== 'production',
          // APK size budget (40 MB): R8 minify, resource shrinking, and compressed native libs inside the APK.
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          useLegacyPackaging: true,
        },
      },
    ],
  ],
  // No EAS (ADR-0009): builds come from expo prebuild + Gradle in GitHub Actions.
  updates: { enabled: false },
  extra: { appEnv },
};

export default config;
