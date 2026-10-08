import preset from '@iraq-maps/tooling/jest';

// Tests live in src/ and next to app.config.ts; skip the generated native project and the export.
export default { ...preset, modulePathIgnorePatterns: ['<rootDir>/(android|ios|dist|\\.expo)/'] };
