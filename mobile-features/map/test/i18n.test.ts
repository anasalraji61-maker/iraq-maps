import { PlaceCategory } from '@iraq-maps/contracts';
import { assertKeyParity } from '@iraq-maps/i18n';
import { expect, it } from '@jest/globals';
import ar from '../src/i18n/ar.json';
import ckb from '../src/i18n/ckb.json';
import en from '../src/i18n/en.json';

it('ar, ckb and en have the same keys and {param} placeholders', () => {
  expect(() => assertKeyParity('map', { ar, ckb, en })).not.toThrow();
});

it('labels every PlaceCategory', () => {
  expect(Object.keys(ar.categories).sort()).toEqual([...PlaceCategory.options].sort());
});
