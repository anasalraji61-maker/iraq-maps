import { Text } from '@iraq-maps/ui';
import { Stack } from 'expo-router';
import type { ReactElement } from 'react';

/** The screen's heading. TalkBack does not expose the native header title as a heading, so the header shows no
 * title and the content starts with this one (`accessibilityRole="header"` via the title variant). */
export function ScreenTitle({ title }: { title: string }): ReactElement {
  return (
    <>
      <Stack.Screen options={{ title, headerTitle: '' }} />
      <Text variant="title">{title}</Text>
    </>
  );
}
