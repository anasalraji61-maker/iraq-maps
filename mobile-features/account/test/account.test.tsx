import { testIDs } from '@iraq-maps/contracts';
import { getLocale, t } from '@iraq-maps/i18n';
import { describe, expect, it } from '@jest/globals';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { AccountScreen, LanguageScreen } from '../src';
import { reply, setup, user } from './render';

const { account } = testIDs;

describe('AccountScreen', () => {
  it('shows the name and language, and signs out on logout', async () => {
    const { session, view } = await setup(<AccountScreen />);
    expect(view.getByText('علي')).toBeTruthy();
    expect(view.getByText(t('account:languages.ar'))).toBeTruthy();
    await fireEvent.press(view.getByTestId(account.logout));
    await waitFor(() => expect(session.signOut).toHaveBeenCalledTimes(1));
  });

  it('deletes the account only after the explicit confirmation, then signs out', async () => {
    const { api, session, view } = await setup(<AccountScreen />);
    api.me.remove.mockReturnValueOnce(reply(204));
    await fireEvent.press(view.getByTestId(account.delete));
    expect(api.me.remove).not.toHaveBeenCalled();
    await fireEvent.press(view.getByTestId(account.deleteConfirm));
    await waitFor(() => expect(session.signOut).toHaveBeenCalledTimes(1));
    expect(api.me.remove).toHaveBeenCalledTimes(1);
  });

  it('keeps the session and shows the error when the delete fails', async () => {
    const { session, view } = await setup(<AccountScreen />);
    await fireEvent.press(view.getByTestId(account.delete));
    await fireEvent.press(view.getByTestId(account.deleteConfirm));
    expect(await view.findByText(t('common:errors.generic'))).toBeTruthy();
    expect(session.signOut).not.toHaveBeenCalled();
  });

  it('offers sign-in and the language picker when signed out', async () => {
    const { router, view } = await setup(<AccountScreen />, { signedIn: false });
    await fireEvent.press(view.getByTestId(account.signIn));
    await fireEvent.press(view.getByTestId(account.language));
    expect(router.push.mock.calls).toEqual([['/auth/phone'], ['/account/language']]);
  });
});

describe('LanguageScreen', () => {
  it('marks the current language, saves a new one to the profile once while busy, then switches the app language', async () => {
    const { api, router, session, view } = await setup(<LanguageScreen />);
    const en = view.getByTestId(testIDs.auth.locale.en);
    expect(view.getByTestId(testIDs.auth.locale.ar)).toBeChecked();
    expect(en).not.toBeChecked();

    const saved = { ...user, locale: 'en' as const };
    let respond = (_res: { status: number; body?: unknown }) => {};
    api.me.update.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    await fireEvent.press(en);
    expect(en).toBeDisabled();
    await fireEvent.press(en);
    expect(view.getByText(t('common:status.loading'))).toBeTruthy();
    respond({ status: 200, body: saved });
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(api.me.update).toHaveBeenCalledTimes(1);
    expect(api.me.update).toHaveBeenCalledWith({ body: { locale: 'en' } });
    expect(session.updateUser).toHaveBeenCalledWith(saved);
    expect(getLocale()).toBe('en');
  });

  it('switches the language locally when signed out', async () => {
    const { api, router, view } = await setup(<LanguageScreen />, { signedIn: false });
    await fireEvent.press(view.getByTestId(testIDs.auth.locale.ckb));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(getLocale()).toBe('ckb');
    expect(api.me.update).not.toHaveBeenCalled();
  });
});
