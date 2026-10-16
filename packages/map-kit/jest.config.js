import preset from '@iraq-maps/tooling/jest';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Write a small CJS stub that jest can require for native AsyncStorage.
const stubDir = resolve(__dirname, 'node_modules/.async-storage-stub');
mkdirSync(stubDir, { recursive: true });
const stubPath = resolve(stubDir, 'index.cjs');
writeFileSync(stubPath, `
const store = {};
const AsyncStorage = {
  getItem: async (key) => store[key] ?? null,
  setItem: async (key, value) => { store[key] = value; },
  removeItem: async (key) => { delete store[key]; },
  clear: async () => { Object.keys(store).forEach(k => delete store[k]); },
  getAllKeys: async () => Object.keys(store),
  multiGet: async (keys) => keys.map(k => [k, store[k] ?? null]),
  multiSet: async (pairs) => pairs.forEach(([k, v]) => { store[k] = v; }),
  multiRemove: async (keys) => keys.forEach(k => delete store[k]),
};
module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
`);

export default {
  ...preset,
  moduleNameMapper: {
    ...preset.moduleNameMapper,
    // AccessibilityLayer imports AsyncStorage which is a native module; stub it.
    '@react-native-async-storage/async-storage': stubPath,
  },
};
