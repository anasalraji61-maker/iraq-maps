import { StyleSheet, FlatList, View, Text as RNText } from 'react-native';
import { Screen } from '@iraq-maps/ui';
import { type ReactElement } from 'react';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

interface LicenseEntry {
  name: string;
  license: string;
}

/** Key open-source packages used in the app and their SPDX license identifiers. */
const OSS_LICENSES: LicenseEntry[] = [
  { name: 'React Native', license: 'MIT' },
  { name: 'Expo', license: 'MIT' },
  { name: 'MapLibre GL Native', license: 'BSD-2-Clause' },
  { name: 'OpenStreetMap data', license: 'ODbL-1.0' },
  { name: 'Valhalla', license: 'MIT' },
  { name: 'Photon', license: 'Apache-2.0' },
  { name: 'PostgreSQL', license: 'PostgreSQL' },
  { name: 'PostGIS', license: 'GPL-2.0' },
  { name: 'NestJS', license: 'MIT' },
  { name: 'pino', license: 'MIT' },
  { name: 'zod', license: 'MIT' },
  { name: 'ts-rest', license: 'MIT' },
  { name: 'BullMQ', license: 'MIT' },
  { name: 'Drizzle ORM', license: 'Apache-2.0' },
];

function LicenseRow({ item }: { item: LicenseEntry }): ReactElement {
  return (
    <View style={styles.row}>
      <RNText style={styles.name}>{item.name}</RNText>
      <RNText style={styles.badge}>{item.license}</RNText>
    </View>
  );
}

/** OSS licenses screen: lists all key open-source dependencies with their SPDX identifiers. */
export function LicensesScreen(): ReactElement {
  return (
    <Screen>
      <ScreenTitle title={t('licenses.title')} />
      <FlatList
        data={OSS_LICENSES}
        keyExtractor={(item) => item.name}
        renderItem={({ item }) => <LicenseRow item={item} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  name: { flex: 1, fontSize: 15 },
  badge: { marginStart: 12, fontSize: 13, color: '#6B7280' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB' },
});
