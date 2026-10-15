import { describe, expect, it, jest } from '@jest/globals';
import { ProblemError, expectStatus } from './request';

jest.mock('@iraq-maps/i18n', () => ({
  t: jest.fn((key: string) => key),
  setLocale: jest.fn(),
}));

describe('ProblemError', () => {
  it('is an instance of Error', () => {
    const e = new ProblemError('not_found');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(ProblemError);
  });

  it('stores the code', () => {
    expect(new ProblemError('unauthorized').code).toBe('unauthorized');
  });

  it('uses code as message', () => {
    expect(new ProblemError('not_found').message).toBe('not_found');
  });

  it('accepts undefined code', () => {
    const e = new ProblemError(undefined);
    expect(e.code).toBeUndefined();
    expect(e.message).toBe('problem');
  });
});

describe('expectStatus', () => {
  it('returns body when status matches', () => {
    const res = { status: 200 as const, body: { items: [] } };
    const body = expectStatus(res, 200);
    expect(body).toEqual({ items: [] });
  });

  it('throws ProblemError with code when status mismatches', () => {
    const res = { status: 404 as const, body: { code: 'place_not_found', title: 'Place not found' } };
    expect(() => expectStatus(res, 200)).toThrow(ProblemError);
    try {
      expectStatus(res, 200);
    } catch (e) {
      expect(e).toBeInstanceOf(ProblemError);
      expect((e as ProblemError).code).toBe('place_not_found');
    }
  });

  it('throws ProblemError with undefined code when body has no code', () => {
    const res = { status: 500 as const, body: null };
    expect(() => expectStatus(res, 200)).toThrow(ProblemError);
    try {
      expectStatus(res, 200);
    } catch (e) {
      expect((e as ProblemError).code).toBeUndefined();
    }
  });
});
