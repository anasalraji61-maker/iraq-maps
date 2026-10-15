/**
 * Unit tests for Me, TokenPair, and other HTTP contracts.
 */
import { describe, expect, it } from 'vitest';
import { Me, TokenPair } from './http';

const VALID_ME = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Ahmed',
  locale: 'ar' as const,
  roles: [] as string[],
  createdAt: '2026-10-15T12:00:00.000Z',
};

describe('Me', () => {
  it('accepts a valid Me object', () => {
    expect(Me.safeParse(VALID_ME).success).toBe(true);
  });

  it('accepts null name', () => {
    expect(Me.safeParse({ ...VALID_ME, name: null }).success).toBe(true);
  });

  it('accepts empty roles array', () => {
    expect(Me.safeParse({ ...VALID_ME, roles: [] }).success).toBe(true);
  });

  it('rejects a non-UUID id', () => {
    expect(Me.safeParse({ ...VALID_ME, id: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects an invalid locale', () => {
    expect(Me.safeParse({ ...VALID_ME, locale: 'xx' }).success).toBe(false);
  });

  it('rejects a non-datetime createdAt', () => {
    expect(Me.safeParse({ ...VALID_ME, createdAt: '2026-10-15' }).success).toBe(false);
  });
});

describe('TokenPair', () => {
  const VALID_PAIR = {
    accessToken: 'eyJhbGciOiJIUzI1NiJ9.test',
    refreshToken: 'eyJhbGciOiJIUzI1NiJ9.refresh',
    accessExpiresAt: '2026-10-15T13:00:00.000Z',
  };

  it('accepts a valid TokenPair', () => {
    expect(TokenPair.safeParse(VALID_PAIR).success).toBe(true);
  });

  it('rejects a missing accessToken', () => {
    const { accessToken: _, ...rest } = VALID_PAIR;
    expect(TokenPair.safeParse(rest).success).toBe(false);
  });

  it('rejects a missing refreshToken', () => {
    const { refreshToken: _, ...rest } = VALID_PAIR;
    expect(TokenPair.safeParse(rest).success).toBe(false);
  });

  it('rejects a non-datetime accessExpiresAt', () => {
    expect(TokenPair.safeParse({ ...VALID_PAIR, accessExpiresAt: '2026-10-15' }).success).toBe(false);
  });

  it('accepts any non-empty accessToken string', () => {
    expect(TokenPair.safeParse({ ...VALID_PAIR, accessToken: 'tok' }).success).toBe(true);
  });
});
