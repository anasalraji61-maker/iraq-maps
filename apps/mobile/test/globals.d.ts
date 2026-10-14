// Declare the global `jest` object that babel-jest injects into setupFiles.
// The shell test files import from @jest/globals explicitly; only setup.ts uses the global.
declare const jest: import('@jest/globals').jest;
