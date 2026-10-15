import { assertKeyParity } from '@iraq-maps/i18n';
import { expect, it } from '@jest/globals';
import ar from './i18n/ar.json';
import ckb from './i18n/ckb.json';
import en from './i18n/en.json';

it('ar, ckb and en have the same keys and {param} placeholders', () => {
  expect(() => assertKeyParity('activity', { ar, ckb, en })).not.toThrow();
});
