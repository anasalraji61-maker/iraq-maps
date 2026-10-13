import type { ManeuverType } from '@iraq-maps/contracts';
import { ar } from '../locales/ar';
import { ckb } from '../locales/ckb';
import { en } from '../locales/en';

/**
 * Builds a human-readable turn instruction in the requested locale.
 * Picks the first street name if multiple are provided; falls back to an unnamed road.
 */
export function buildInstruction(
  type: ManeuverType,
  streetNames: string[],
  distanceM: number,
  locale: 'ar' | 'ckb' | 'en',
): string {
  const street = streetNames[0] ?? '';
  const table = locale === 'ar' ? ar : locale === 'ckb' ? ckb : en;
  return table[type](street, distanceM);
}
