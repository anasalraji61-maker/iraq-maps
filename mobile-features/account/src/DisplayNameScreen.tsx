import { useApi, useSession } from '@iraq-maps/mobile-kit';
import { Button, Screen, Text, TextField } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { expectStatus, useRequest } from './request';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

/** Edit the signed-in user's display name. PATCH /me with { name }. */
export function DisplayNameScreen(): ReactElement {
  const api = useApi();
  const session = useSession();
  const router = useRouter();
  const [name, setName] = useState(
    session.state.status === 'signedIn' ? (session.state.user.name ?? '') : '',
  );
  const { busy, error, run } = useRequest();

  const save = () =>
    run(async () => {
      session.updateUser(expectStatus(await api.me.update({ body: { name: name.trim() } }), 200));
      router.back();
    });

  return (
    <Screen scroll>
      <ScreenTitle title={t('displayName.title')} />
      <Text tone="muted">{t('name.body')}</Text>
      <TextField
        label={t('displayName.label')}
        value={name}
        onChangeText={setName}
        error={error}
        maxLength={80}
        autoFocus
      />
      <Button
        label={t('displayName.save')}
        onPress={save}
        disabled={!name.trim()}
        loading={busy}
      />
    </Screen>
  );
}
