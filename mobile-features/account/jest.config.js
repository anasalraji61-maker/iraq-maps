import preset from '@iraq-maps/tooling/jest';

// clearMocks: the tests share one expo-router mock (test/setup.ts) and assert on its calls per test.
export default { ...preset, clearMocks: true, setupFiles: ['<rootDir>/test/setup.ts'] };
