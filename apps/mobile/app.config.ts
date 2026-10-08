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
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],
  ],
  // No EAS (ADR-0009): builds come from expo prebuild + Gradle in GitHub Actions.
  updates: { enabled: false },
  extra: { appEnv },
};

export default config;
