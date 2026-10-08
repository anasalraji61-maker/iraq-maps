import { afterEach, describe, expect, it } from 'vitest';
import { captureLogs, createLogger, type LogCapture } from './index';

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlLXZhbHVl';
const PHONE_PATTERN = /\+?9647\d{9}|07\d{9}/;
let capture: LogCapture;
afterEach(() => capture.stop());

describe('createLogger', () => {
  it('writes JSON records with name, level and message', () => {
    capture = captureLogs();
    createLogger({ name: 'api' }).info({ route: '/health' }, 'ok');
    expect(capture.records).toEqual([expect.objectContaining({ name: 'api', level: 30, msg: 'ok', route: '/health' })]);
  });

  it('honours the level', () => {
    capture = captureLogs();
    const log = createLogger({ name: 'api', level: 'warn' });
    log.info('hidden');
    log.warn('shown');
    expect(capture.records.map((r) => r.msg)).toEqual(['shown']);
  });

  it('redacts Iraqi phone numbers in the message and in any nested string field', () => {
    capture = captureLogs();
    createLogger({ name: 'identity' }).info(
      { user: { phone: '+9647701234567', note: 'call 07801234567 or 9647501234567 later' }, list: ['07701234567'] },
      'otp requested for +9647701234567',
    );
    expect(capture.text()).not.toMatch(PHONE_PATTERN);
    expect(capture.records[0]).toMatchObject({
      msg: 'otp requested for [phone]',
      user: { phone: '[phone]', note: 'call [phone] or [phone] later' },
      list: ['[phone]'],
    });
  });

  it('leaves ids and other numbers that merely contain those digits alone', () => {
    capture = captureLogs();
    createLogger({ name: 'api' }).info({ requestId: 'c07123456789a', amount: '1207701234567' });
    expect(capture.records[0]).toMatchObject({ requestId: 'c07123456789a', amount: '1207701234567' });
  });

  it('redacts JWT-looking strings and secret keys at any depth', () => {
    capture = captureLogs();
    createLogger({ name: 'identity' }).info({
      headers: { authorization: `Bearer ${JWT}`, 'user-agent': 'okhttp' },
      body: { refreshToken: 'opaque-refresh', accessToken: 'opaque-access', otp: '123456', code: '654321', refresh_token: 'snake' },
      token: { nested: 'object' },
      note: `leaked ${JWT} here`,
    });
    const text = capture.text();
    for (const secret of [JWT, 'opaque-refresh', 'opaque-access', '123456', '654321', 'snake', 'object']) expect(text).not.toContain(secret);
    expect(capture.records[0]).toMatchObject({
      headers: { authorization: '[redacted]', 'user-agent': 'okhttp' },
      body: { refreshToken: '[redacted]', accessToken: '[redacted]', otp: '[redacted]', code: '[redacted]' },
      token: '[redacted]',
      note: 'leaked [jwt] here',
    });
  });

  it('rounds coordinates to 2 decimals', () => {
    capture = captureLogs();
    createLogger({ name: 'map' }).info({ origin: { lat: 36.191234, lng: 44.009876 }, lon: -45.6789, latitude: 33.315, zoom: 14.567 });
    expect(capture.records[0]).toMatchObject({ origin: { lat: 36.19, lng: 44.01 }, lon: -45.68, latitude: 33.32, zoom: 14.567 });
  });

  it('redacts child bindings and serialized errors', () => {
    capture = captureLogs();
    const child = createLogger({ name: 'identity' }).child({ phone: '+9647701234567', requestId: 'r1' });
    child.error({ err: new Error(`duplicate phone 07701234567 token ${JWT}`) }, 'failed');
    expect(capture.text()).not.toMatch(PHONE_PATTERN);
    expect(capture.text()).not.toContain(JWT);
    expect(capture.records[0]).toMatchObject({ name: 'identity', requestId: 'r1', phone: '[phone]', msg: 'failed' });
  });
});

describe('captureLogs', () => {
  it('captures every logger, including ones created earlier, until stop()', () => {
    const early = createLogger({ name: 'early' });
    capture = captureLogs();
    const second = captureLogs();
    early.info('one');
    createLogger({ name: 'late' }).info('two');
    second.stop();
    early.info('three');
    expect(capture.records.map((r) => `${r.name}:${r.msg}`)).toEqual(['early:one', 'late:two', 'early:three']);
    expect(second.records).toHaveLength(2);
    expect(capture.text().trim().split('\n')).toHaveLength(3);
  });
});
