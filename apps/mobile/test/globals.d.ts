// Declare the global `jest` object that babel-jest injects into setupFiles.
// The shell test files import from @jest/globals explicitly; only setup.ts uses the global.
import type { Jest } from '@jest/environment';
declare global {
  const jest: Jest;
}
