import preset from '@iraq-maps/tooling/jest';

export default { ...preset, clearMocks: true, setupFiles: ['<rootDir>/src/test-setup.ts'] };
