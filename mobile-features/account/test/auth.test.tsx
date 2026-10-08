import { testIDs } from '@iraq-maps/contracts';
import { t } from '@iraq-maps/i18n';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { LanguageScreen, NameScreen, OtpScreen, PhoneScreen } from '../src';
import { reply, setup, tokens, user } from './render';

const { auth } = testIDs;
const phone = '+9647701234567';
const sent = { expiresAt: '2026-10-08T00:05:00.000Z', resendAfterSec: 60 };

it.each([
  ['PhoneScreen', <PhoneScreen key="p" />, 'phone'],
  ['OtpScreen', <OtpScreen key="o" />, 'otp'],
  ['NameScreen', <NameScreen key="n" />, 'name'],
  ['LanguageScreen', <LanguageScreen key="l" />, 'language'],
])('%s starts with its title as a heading that TalkBack exposes', async (_, ui, key) => {
  const { view } = await setup(ui, { signedIn: false });
  expect(view.getByRole('header', { name: t(`account:${key}.title`) })).toBeTruthy();
});

describe('PhoneScreen', () => {
  it('shows the validation message and calls nothing for a number that is not an Iraqi mobile', async () => {
    const { api, view } = await setup(<PhoneScreen />, { signedIn: false });
    await fireEvent.changeText(view.getByTestId(auth.phoneInput), '0612345678');
    await fireEvent.press(view.getByTestId(auth.phoneSubmit));
    expect(view.getByText(t('account:phone.invalid'))).toBeTruthy();
    expect(api.auth.requestOtp).not.toHaveBeenCalled();
  });

  it('keeps the phone field left-to-right, and announces the same error again on a second failed submit', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { view } = await setup(<PhoneScreen />, { signedIn: false });
    expect(view.getByTestId(auth.phoneInput)).toHaveStyle({ direction: 'ltr' });
    await fireEvent.changeText(view.getByTestId(auth.phoneInput), '0612345678');
    await fireEvent.press(view.getByTestId(auth.phoneSubmit));
    await fireEvent.press(view.getByTestId(auth.phoneSubmit));
    await waitFor(() => expect(announce.mock.calls.filter(([m]) => m === t('account:phone.invalid'))).toHaveLength(2));
    announce.mockRestore();
  });

  it('normalizes Arabic-Indic 07 input, requests a code and opens the OTP screen', async () => {
    const { api, router, view } = await setup(<PhoneScreen />, { signedIn: false });
    api.auth.requestOtp.mockReturnValueOnce(reply(202, sent));
    await fireEvent.changeText(view.getByTestId(auth.phoneInput), '٠٧٧٠ ١٢٣ ٤٥٦٧');
    await fireEvent.press(view.getByTestId(auth.phoneSubmit));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/auth/otp', params: { phone, resendAfterSec: 60 } }));
    expect(api.auth.requestOtp).toHaveBeenCalledWith({ body: { phone, locale: 'ar' } });
  });
});

describe('OtpScreen', () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ phone, resendAfterSec: '60' });
  afterEach(() => {
    jest.useRealTimers();
  });

  const submitCode = async (view: Awaited<ReturnType<typeof setup>>['view'], code = '123456') => {
    await fireEvent.changeText(view.getByTestId(auth.otpInput), code);
    await fireEvent.press(view.getByTestId(auth.otpSubmit));
  };

  it('keeps the code field left-to-right', async () => {
    const { view } = await setup(<OtpScreen />, { signedIn: false });
    expect(view.getByTestId(auth.otpInput)).toHaveStyle({ direction: 'ltr' });
  });

  it('counts down the 60s the server asked for in Arabic-Indic m:ss, then requests a new code and restarts the timer', async () => {
    jest.useFakeTimers();
    const { api, view } = await setup(<OtpScreen />, { signedIn: false });
    const resend = () => view.getByTestId(auth.otpResend);
    expect(resend()).toHaveAccessibleName(t('account:otp.resendIn', { time: '١:٠٠' }));
    await act(async () => void jest.advanceTimersByTime(59_000));
    expect(resend()).toHaveAccessibleName(t('account:otp.resendIn', { time: '٠:٠١' }));
    expect(resend()).toBeDisabled();
    await act(async () => void jest.advanceTimersByTime(1_000));
    expect(resend()).toBeEnabled();

    api.auth.requestOtp.mockReturnValueOnce(reply(202, sent));
    await fireEvent.press(resend());
    await waitFor(() => expect(resend()).toBeDisabled());
    expect(api.auth.requestOtp).toHaveBeenCalledWith({ body: { phone, locale: 'ar' } });
  });

  it.each<[boolean, 'replace' | 'dismissTo', string]>([
    [true, 'replace', '/auth/name'],
    [false, 'dismissTo', '/account'],
  ])('verifies an Arabic-Indic code and signs in (isNewUser=%s: router.%s %s)', async (isNewUser, method, path) => {
    const { api, router, session, view } = await setup(<OtpScreen />, { signedIn: false });
    api.auth.verifyOtp.mockReturnValueOnce(reply(200, { ...tokens, user, isNewUser }));
    await submitCode(view, '١٢٣٤٥٦');
    await waitFor(() => expect(router[method]).toHaveBeenCalledWith(path));
    expect(api.auth.verifyOtp).toHaveBeenCalledWith({ body: { phone, code: '123456' } });
    expect(session.signIn).toHaveBeenCalledWith(tokens, user);
  });

  it.each<[number, string]>([
    [401, 'otp_invalid'],
    [401, 'otp_expired'],
    [429, 'otp_too_many_attempts'],
    [429, 'otp_locked'],
    [429, 'otp_rate_limited'],
    [429, 'otp_resend_too_soon'],
    [400, 'invalid_request'],
  ])('maps %i %s to its own localized message', async (status, code) => {
    const { api, session, view } = await setup(<OtpScreen />, { signedIn: false });
    api.auth.verifyOtp.mockReturnValueOnce(reply(status, { type: 'about:blank', title: code, status, code }));
    await submitCode(view);
    expect(await view.findByText(t(`account:errors.${code}`))).toBeTruthy();
    expect(session.signIn).not.toHaveBeenCalled();
  });

  it('uses the shared messages for an unreachable server, an expired session and any other failure', async () => {
    const { api, view } = await setup(<OtpScreen />, { signedIn: false });
    api.auth.verifyOtp.mockRejectedValueOnce(new TypeError('Network request failed'));
    await submitCode(view);
    expect(await view.findByText(t('common:errors.network'))).toBeTruthy();
    api.auth.verifyOtp.mockReturnValueOnce(reply(401, { type: 'about:blank', title: 'Unauthorized', status: 401, code: 'unauthorized' }));
    await submitCode(view);
    expect(await view.findByText(t('common:errors.sessionExpired'))).toBeTruthy();
    await submitCode(view);
    expect(await view.findByText(t('common:errors.generic'))).toBeTruthy();
  });
});

describe('NameScreen', () => {
  it('saves the trimmed name to the profile and returns to the account tab', async () => {
    const { api, router, session, view } = await setup(<NameScreen />);
    const saved = { ...user, name: 'علي حسن' };
    api.me.update.mockReturnValueOnce(reply(200, saved));
    await fireEvent.changeText(view.getByTestId(auth.nameInput), '  علي حسن ');
    await fireEvent.press(view.getByTestId(auth.nameSubmit));
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/account'));
    expect(api.me.update).toHaveBeenCalledWith({ body: { name: 'علي حسن' } });
    expect(session.updateUser).toHaveBeenCalledWith(saved);
  });
});
