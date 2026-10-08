// Shared jest-expo preset for React Native packages, like ./vitest.preset.ts for Node ones.
// The first render of each test file transforms most of React Native (~5s cold). One worker per package: each extra
// worker repeats that cold transform, and turbo already runs the RN packages in parallel (pnpm gate caps it at 4 tasks).
// 30s: that cold start under CI load still exceeds Jest's 5s default.
export default { preset: 'jest-expo', testTimeout: 30_000, maxWorkers: 1 };
