/**
 * Unit tests for noopReporter and logReporter.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { captureLogs, createLogger, logReporter, noopReporter, type LogCapture } from './index';

describe('noopReporter', () => {
  it('has kind noop', () => {
    expect(noopReporter().kind).toBe('noop');
  });

  it('captureException does not throw', () => {
    const r = noopReporter();
    expect(() => r.captureException(new Error('oops'), { context: 'test' })).not.toThrow();
  });

  it('captureMessage does not throw', () => {
    const r = noopReporter();
    expect(() => r.captureMessage('test message', 'error')).not.toThrow();
  });

  it('setUser does not throw with a user', () => {
    const r = noopReporter();
    expect(() => r.setUser({ id: 'user-1' })).not.toThrow();
  });

  it('setUser does not throw with null', () => {
    const r = noopReporter();
    expect(() => r.setUser(null)).not.toThrow();
  });
});

describe('logReporter', () => {
  let capture: LogCapture;
  afterEach(() => capture.stop());

  it('has kind log', () => {
    capture = captureLogs();
    const r = logReporter(createLogger({ name: 'test-reporter' }));
    expect(r.kind).toBe('log');
  });

  it('captureException logs an error record', () => {
    capture = captureLogs();
    const r = logReporter(createLogger({ name: 'test-reporter' }));
    r.captureException(new Error('test error'));
    expect(capture.records.some((rec) => rec.level === 50 && rec.msg === 'test error')).toBe(true);
  });

  it('captureException with non-Error value', () => {
    capture = captureLogs();
    const r = logReporter(createLogger({ name: 'test-reporter' }));
    r.captureException('string error');
    expect(capture.records.some((rec) => rec.level === 50)).toBe(true);
  });

  it('setUser does not throw', () => {
    capture = captureLogs();
    const r = logReporter(createLogger({ name: 'test-reporter' }));
    expect(() => r.setUser({ id: 'u1' })).not.toThrow();
  });

  it('setUser with null does not throw', () => {
    capture = captureLogs();
    const r = logReporter(createLogger({ name: 'test-reporter' }));
    expect(() => r.setUser(null)).not.toThrow();
  });
});
