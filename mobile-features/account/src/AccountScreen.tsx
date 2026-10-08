import { testIDs } from '@iraq-maps/contracts';
import { getLocale } from '@iraq-maps/i18n';
import { href, useApi, useSession } from '@iraq-maps/mobile-kit';
import { Banner, Button, EmptyState, ListItem, Screen, Sheet, Text } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { expectStatus, useRequest } from './request';
import { t } from './strings';

export function AccountScreen(): ReactElement {
  const api = useApi();
  const session = useSession();
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { busy, error, run } = useRequest();
  const { state } = session;

  if (state.status === 'loading') return <Screen>{null}</Screen>;

  const languageItem = (
    <ListItem
      testID={testIDs.account.language}
      title={t('profile.language')}
      subtitle={t(`languages.${getLocale()}`)}
      onPress={() => router.push(href('accountLanguage'))}
    />
  );

  if (state.status === 'signedOut') {
    return (
      <Screen>
        <EmptyState title={t('profile.signedOutTitle')} body={t('profile.signedOutBody')} />
        <Button testID={testIDs.account.signIn} label={t('profile.signIn')} onPress={() => router.push(href('authPhone'))} />
        {languageItem}
      </Screen>
    );
  }

  const deleteAccount = () =>
    run(async () => {
      expectStatus(await api.me.remove(), 204);
      setConfirmingDelete(false);
      await session.signOut();
    });
  const banner = error ? <Banner kind="error" message={error} /> : null;

  return (
    <Screen scroll>
      {confirmingDelete ? null : banner}
      <ListItem title={t('profile.name')} subtitle={state.user.name ?? t('profile.noName')} onPress={() => router.push(href('authName'))} />
      {languageItem}
      <Button testID={testIDs.account.logout} variant="secondary" label={t('profile.logout')} onPress={() => run(() => session.signOut())} loading={busy} />
      <Button testID={testIDs.account.delete} variant="danger" label={t('profile.delete')} onPress={() => setConfirmingDelete(true)} disabled={busy} />
      <Sheet visible={confirmingDelete} onClose={() => setConfirmingDelete(false)}>
        <Text variant="subtitle">{t('deleteSheet.title')}</Text>
        <Text>{t('deleteSheet.body')}</Text>
        {banner}
        <Button testID={testIDs.account.deleteConfirm} variant="danger" label={t('deleteSheet.confirm')} onPress={deleteAccount} loading={busy} />
        <Button variant="secondary" label={t('deleteSheet.cancel')} onPress={() => setConfirmingDelete(false)} disabled={busy} />
      </Sheet>
    </Screen>
  );
}
