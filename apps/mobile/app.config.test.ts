import { afterEach, expect, it, jest } from '@jest/globals';
import type { ExpoConfig } from 'expo/config';

const initial = process.env.EXPO_PUBLIC_APP_ENV;
const setAppEnv = (value: string | undefined) => {
  if (value === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
  else process.env.EXPO_PUBLIC_APP_ENV = value;
};
afterEach(() => setAppEnv(initial));

function build(appEnv: string | undefined) {
  setAppEnv(appEnv);
  let config: ExpoConfig | undefined;
  jest.isolateModules(() => {
    config = jest.requireActual<{ default: ExpoConfig }>('./app.config').default;
  });
  const [, props] = config!.plugins!.find((p) => Array.isArray(p) && p[0] === 'expo-build-properties') as [string, { android: { usesCleartextTraffic: boolean } }];
  return { appEnv: config!.extra?.appEnv, cleartext: props.android.usesCleartextTraffic };
}

it('fails closed: an unset EXPO_PUBLIC_APP_ENV builds production without cleartext HTTP', () => {
  expect(build(undefined)).toEqual({ appEnv: 'production', cleartext: false });
  expect(build('')).toEqual({ appEnv: 'production', cleartext: false });
});

it('refuses an unknown EXPO_PUBLIC_APP_ENV at prebuild instead of building a cleartext app the runtime treats as production', () => {
  for (const value of ['staging', 'developement', 'Production']) expect(() => build(value)).toThrow(/EXPO_PUBLIC_APP_ENV must be one of/);
});

it('allows cleartext HTTP outside production', () => {
  expect(build('development')).toEqual({ appEnv: 'development', cleartext: true });
  expect(build('e2e')).toEqual({ appEnv: 'e2e', cleartext: true });
});
