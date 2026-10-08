// testTimeout: a cold jest-expo transform cache with several RN packages testing in parallel (CI) can exceed the 5 s default.
export default { preset: 'jest-expo', clearMocks: true, testTimeout: 30000, setupFiles: ['<rootDir>/test/setup.ts'] };
