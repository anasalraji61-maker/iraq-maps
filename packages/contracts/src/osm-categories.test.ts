/**
 * Unit tests for OsmCategoryRules: verifies the structure and spot-checks key mappings.
 */
import { describe, expect, it } from 'vitest';
import { OsmCategoryRules } from './osm-categories';

describe('OsmCategoryRules', () => {
  it('has ignoredValues array with "no" and "vacant"', () => {
    expect(OsmCategoryRules.ignoredValues).toContain('no');
    expect(OsmCategoryRules.ignoredValues).toContain('vacant');
  });

  it('has a rules array with at least one entry', () => {
    expect(Array.isArray(OsmCategoryRules.rules)).toBe(true);
    expect(OsmCategoryRules.rules.length).toBeGreaterThan(0);
  });

  it('maps amenity=restaurant to food', () => {
    const amenityRule = OsmCategoryRules.rules.find((r) => r.key === 'amenity');
    expect(amenityRule).toBeDefined();
    expect(amenityRule?.values['restaurant']).toBe('food');
  });

  it('maps amenity=cafe to cafe', () => {
    const amenityRule = OsmCategoryRules.rules.find((r) => r.key === 'amenity');
    expect(amenityRule?.values['cafe']).toBe('cafe');
  });

  it('maps amenity=pharmacy to health', () => {
    const amenityRule = OsmCategoryRules.rules.find((r) => r.key === 'amenity');
    expect(amenityRule?.values['pharmacy']).toBe('health');
  });

  it('maps shop=* to shopping', () => {
    const shopRule = OsmCategoryRules.rules.find((r) => r.key === 'shop');
    expect(shopRule).toBeDefined();
    expect(shopRule?.values['*']).toBe('shopping');
  });

  it('maps tourism=hotel to lodging', () => {
    const tourismRule = OsmCategoryRules.rules.find((r) => r.key === 'tourism');
    expect(tourismRule?.values['hotel']).toBe('lodging');
  });

  it('maps tourism=museum to tourism', () => {
    const tourismRule = OsmCategoryRules.rules.find((r) => r.key === 'tourism');
    expect(tourismRule?.values['museum']).toBe('tourism');
  });

  it('maps amenity=bank to finance', () => {
    const amenityRule = OsmCategoryRules.rules.find((r) => r.key === 'amenity');
    expect(amenityRule?.values['bank']).toBe('finance');
  });

  it('each rule has key and values properties', () => {
    for (const rule of OsmCategoryRules.rules) {
      expect(typeof rule.key).toBe('string');
      expect(typeof rule.values).toBe('object');
    }
  });
});
