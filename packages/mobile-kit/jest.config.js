import preset from '@iraq-maps/tooling/jest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export default {
  ...preset,
  setupFiles: ['<rootDir>/test/setup.ts'],
  moduleNameMapper: {
    ...preset.moduleNameMapper,
    'expo-haptics': require.resolve('./test/__mocks__/expo-haptics.cjs'),
  },
};
