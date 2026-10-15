import preset from '@iraq-maps/tooling/jest';

// jest-expo's default transformIgnorePatterns excludes node_modules but we need to transform
// ESM-only packages (uuid) that ship as ES modules.
const EXTRA_TRANSFORM = 'uuid';
const baseIgnore = preset.transformIgnorePatterns
  ? preset.transformIgnorePatterns[0] ?? 'node_modules'
  : 'node_modules/(?!(jest-expo|@expo|expo|react-native|@react-native|@react-navigation|@unimodules|unimodules|sentry-expo|native-base|react-clone-referenced-element)/)';

const transformIgnorePatterns = [
  baseIgnore.replace('node_modules', `node_modules/(?!(${EXTRA_TRANSFORM})/)`),
];

// Tests live in src/ and next to app.config.ts; skip the generated native project and the export.
export default {
  ...preset,
  modulePathIgnorePatterns: ['<rootDir>/(android|ios|dist|\\.expo)/'],
  setupFiles: ['<rootDir>/test/setup.ts'],
  transformIgnorePatterns,
};
