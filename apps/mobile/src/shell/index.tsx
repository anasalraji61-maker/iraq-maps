import { testIDs } from '@iraq-maps/contracts';
import { Stack, Tabs } from 'expo-router';
import { I18nManager, Text, View } from 'react-native';

// M0 freeze skeleton. builder-mobile-shell replaces this with i18n labels, locale-driven RTL + reload,
// the auth gate, providers and the developer server-URL screen.
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

const tabs = [
  { name: 'index', label: 'الخريطة', testID: testIDs.tabs.map },
  { name: 'discover', label: 'اكتشف', testID: testIDs.tabs.discover },
  { name: 'messages', label: 'الرسائل', testID: testIDs.tabs.messages },
  { name: 'activity', label: 'نشاطي', testID: testIDs.tabs.activity },
  { name: 'account', label: 'الحساب', testID: testIDs.tabs.account },
] as const;
const pendingLabel = 'قريباً';

export function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

export function TabsLayout() {
  return (
    <Tabs>
      {tabs.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label, tabBarButtonTestID: t.testID }} />
      ))}
    </Tabs>
  );
}

export function PendingScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>{pendingLabel}</Text>
    </View>
  );
}
