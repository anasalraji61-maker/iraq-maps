import type { ReactElement } from 'react';

/** Screens re-exported one-per-file by apps/mobile/app routes. Strings live in src/i18n/{ar,ckb,en}.json (namespace 'account'). */
const stub = (): ReactElement => {
  throw new Error('not implemented');
};
export const PhoneScreen: () => ReactElement = stub;
export const OtpScreen: () => ReactElement = stub;
export const NameScreen: () => ReactElement = stub;
export const AccountScreen: () => ReactElement = stub;
export const LanguageScreen: () => ReactElement = stub;
