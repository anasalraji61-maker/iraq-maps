import { testIDs } from '@iraq-maps/contracts';
import { href, useApi, useSession } from '@iraq-maps/mobile-kit';
import { Button, Screen, Text, TextField } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { expectStatus, useRequest } from './request';
import { t } from './strings';

/** Sets the name after a first sign-in, and edits it later from AccountScreen. */
export function NameScreen(): ReactElement {
  const api = useApi();
  const session = useSession();
  const router = useRouter();
  const [name, setName] = useState(session.state.status === 'signedIn' ? (session.state.user.name ?? '') : '');
  const { busy, error, run } = useRequest();

  const save = () =>
    run(async () => {
      session.updateUser(expectStatus(await api.me.update({ body: { name: name.trim() } }), 200));
      router.dismissTo(href('account'));
    });

  return (
    <Screen>
      <Text variant="title">{t('name.title')}</Text>
      <Text tone="muted">{t('name.body')}</Text>
      <TextField testID={testIDs.auth.nameInput} label={t('name.label')} value={name} onChangeText={setName} error={error} maxLength={80} autoFocus />
      <Button testID={testIDs.auth.nameSubmit} label={t('name.save')} onPress={save} disabled={!name.trim()} loading={busy} />
    </Screen>
  );
}
