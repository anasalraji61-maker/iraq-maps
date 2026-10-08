// Shared jest-expo preset for React Native packages, like ./vitest.preset.ts for Node ones.
// 30s: a cold jest-expo transform cache with several RN packages testing in parallel (CI) exceeds Jest's 5s default.
export default { preset: 'jest-expo', testTimeout: 30_000 };
