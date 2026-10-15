/**
 * Memory profiling for key operations — ensures no large allocations or leaks
 * in hot-path utilities (contract parsing, JSON serialization).
 *
 * These are unit-level tests; they do not require a database.
 */
import { describe, expect, it } from 'vitest';
import { NotificationItem } from '@iraq-maps/contracts';

/** Returns current heap used in bytes. */
function heapUsed(): number {
  return process.memoryUsage().heapUsed;
}

/** Runs `fn` N times and returns the net heap growth in bytes. */
function measureHeapGrowth(fn: () => void, iterations = 1000): number {
  // Warm up
  for (let i = 0; i < 10; i++) fn();

  const gcFn = (global as unknown as { gc?: () => void }).gc;
  if (gcFn) gcFn();
  const before = heapUsed();

  for (let i = 0; i < iterations; i++) fn();

  if (gcFn) gcFn();
  const after = heapUsed();

  return after - before;
}

describe('zod contract parsing memory', () => {
  it('parsing 1000 NotificationItem objects does not grow heap by more than 10 MB', () => {
    const sample = {
      id: '11111111-1111-1111-1111-111111111111',
      title: 'إشعار جديد',
      body: 'لديك رسالة جديدة',
      readAt: null,
      createdAt: new Date().toISOString(),
    };

    const growth = measureHeapGrowth(() => {
      NotificationItem.parse(sample);
    });
    expect(growth).toBeLessThan(10 * 1024 * 1024);
  });
});

describe('JSON serialization memory', () => {
  it('serializing 1000 medium objects stays under 5 MB heap growth', () => {
    const obj = {
      id: 'test-id',
      data: new Array(50).fill(null).map((_, i) => ({ index: i, value: `item_${i}` })),
    };

    const growth = measureHeapGrowth(() => {
      JSON.stringify(obj);
    });
    expect(growth).toBeLessThan(5 * 1024 * 1024);
  });

  it('parsing 1000 JSON strings stays under 5 MB heap growth', () => {
    const raw = JSON.stringify({ items: new Array(20).fill({ id: '1', name: 'test' }), count: 20 });

    const growth = measureHeapGrowth(() => {
      JSON.parse(raw);
    });
    expect(growth).toBeLessThan(5 * 1024 * 1024);
  });
});

describe('string manipulation memory', () => {
  it('Arabic string normalization (manual) stays under 2 MB', () => {
    const samples = ['مرحبا', 'الكرادة', 'بغداد', 'أربيل', 'السليمانية'];

    const growth = measureHeapGrowth(() => {
      for (const s of samples) {
        // Common normalization: remove diacritics, normalize alef variants
        s.normalize('NFC').replace(/[ؐ-ًؚ-ٟ]/g, '');
      }
    });
    expect(growth).toBeLessThan(2 * 1024 * 1024);
  });
});
