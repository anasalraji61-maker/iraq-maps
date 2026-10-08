import preset from '@iraq-maps/tooling/jest';

// clearMocks: test/setup.ts mocks MapLibre, expo-location and expo-router once; each test asserts on its own calls.
export default { ...preset, clearMocks: true, setupFiles: ['<rootDir>/test/setup.ts'] };
