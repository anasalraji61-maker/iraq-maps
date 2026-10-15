import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { crashReporter } from './crash-reporter';

describe('crashReporter (console mock)', () => {
  let spy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('logs captureException to console.error', () => {
    const err = new Error('boom');
    crashReporter.captureException(err);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[CrashReporter]'),
      expect.stringContaining('boom'),
      expect.anything(),
    );
  });

  it('breadcrumb at error level logs via console.error', () => {
    crashReporter.breadcrumb('test message', 'error');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('test message'));
  });
});
