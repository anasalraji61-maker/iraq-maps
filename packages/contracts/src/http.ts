import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { IraqiPhone, Locale, Problem, Role, UserId } from './common';
import { citiesContract, placesContract } from './places';

const c = initContract();

export const Me = z.object({
  id: UserId,
  name: z.string().nullable(),
  locale: Locale,
  roles: z.array(Role),
  createdAt: z.string().datetime(),
});
export type Me = z.infer<typeof Me>;

export const TokenPair = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessExpiresAt: z.string().datetime(),
});
export type TokenPair = z.infer<typeof TokenPair>;

export const healthContract = c.router({
  health: {
    method: 'GET',
    path: '/health',
    responses: { 200: z.object({ status: z.literal('ok'), version: z.string() }) },
  },
});

export const authContract = c.router(
  {
    requestOtp: {
      method: 'POST',
      path: '/auth/otp/request',
      body: z.object({ phone: IraqiPhone, locale: Locale.default('ar') }),
      responses: { 202: z.object({ expiresAt: z.string().datetime(), resendAfterSec: z.number().int() }), 400: Problem, 429: Problem },
    },
    verifyOtp: {
      method: 'POST',
      path: '/auth/otp/verify',
      body: z.object({ phone: IraqiPhone, code: z.string().regex(/^\d{6}$/) }),
      responses: { 200: TokenPair.extend({ user: Me, isNewUser: z.boolean() }), 400: Problem, 401: Problem, 429: Problem },
    },
    refresh: {
      method: 'POST',
      path: '/auth/refresh',
      body: z.object({ refreshToken: z.string() }),
      responses: { 200: TokenPair, 401: Problem },
    },
    logout: {
      method: 'POST',
      path: '/auth/logout',
      body: z.object({ refreshToken: z.string() }),
      responses: { 204: c.noBody() },
    },
  },
  { pathPrefix: '/v1' },
);

export const meContract = c.router(
  {
    get: { method: 'GET', path: '/me', responses: { 200: Me, 401: Problem } },
    update: {
      method: 'PATCH',
      path: '/me',
      body: z.object({ name: z.string().trim().min(1).max(80).regex(/^[^\p{Cc}]*$/u).optional(), locale: Locale.optional() }),
      responses: { 200: Me, 400: Problem, 401: Problem },
    },
    remove: { method: 'DELETE', path: '/me', body: c.noBody(), responses: { 204: c.noBody(), 401: Problem } },
  },
  { pathPrefix: '/v1', strictStatusCodes: true },
);

export const apiContract = c.router({ health: healthContract, auth: authContract, me: meContract, cities: citiesContract, places: placesContract });
export type ApiContract = typeof apiContract;
