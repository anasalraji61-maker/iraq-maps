// Shared jest-expo preset for React Native packages, like ./vitest.preset.ts for Node ones.
// The first render of each test file transforms most of React Native (~5s cold). One worker per package: each extra
// worker repeats that cold transform, and turbo already runs the RN packages in parallel (pnpm gate caps it at 4 tasks).
// 30s: that cold start under CI load still exceeds Jest's 5s default.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const emptyMock = require.resolve('./src/__mocks__/empty.cjs');

export default {
  preset: 'jest-expo',
  testTimeout: 30_000,
  maxWorkers: 1,
  // jest-expo v57 setup.js mocks expo internal paths that don't exist outside the Expo app shell.
  // Map them to empty stubs so non-app packages can use jest-expo without "Cannot find module" errors.
  moduleNameMapper: {
    // jest-expo v57 setup.js mocks expo internal paths that don't exist outside the Expo app shell.
    'expo/src/async-require/messageSocket': emptyMock,
    'expo/src/winter/FormData': emptyMock,
    'expo/src/winter': emptyMock,
    'expo/virtual/streams': emptyMock,
    'expo/virtual/env': require.resolve('./src/__mocks__/expo-virtual-env.cjs'),
    // expo-haptics imports expo which isn't installed at workspace root (lives in apps/mobile).
    // It's a native module anyway; jest tests mock it explicitly where needed.
    'expo-haptics': emptyMock,
    // react-native-svg is a native module; stub it in the jest environment.
    'react-native-svg': emptyMock,
    // expo-location (and other expo-* packages) transitively import 'expo' core which
    // isn't installed at the workspace root (lives in apps/mobile). Stub the bare 'expo'
    // package so expo-* modules can load; tests that use expo-location mock it explicitly.
    '^expo$': require.resolve('./src/__mocks__/expo-core.cjs'),
  },
};
