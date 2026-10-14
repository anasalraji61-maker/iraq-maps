import { StyleSheet, FlatList, View, Text as RNText } from 'react-native';
import { Screen } from '@iraq-maps/ui';
import { type ReactElement } from 'react';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';
import licensesData from './licenses.generated.json';

interface LicenseEntry {
  name: string;
  version: string;
  license: string;
  url: string;
  summary?: boolean;
}

const LICENSES = licensesData as LicenseEntry[];

function LicenseRow({ item }: { item: LicenseEntry }): ReactElement {
  if (item.summary) {
    return (
      <View style={styles.summaryRow}>
        <RNText style={styles.summaryText}>{item.name}</RNText>
        <RNText style={styles.badge}>{item.license}</RNText>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <View style={styles.nameCol}>
        <RNText style={styles.name}>{item.name}</RNText>
        {item.version ? <RNText style={styles.version}>{item.version}</RNText> : null}
      </View>
      <RNText style={styles.badge}>{item.license}</RNText>
    </View>
  );
}

/** OSS licenses screen: generated from pnpm licenses list at build time. */
export function LicensesScreen(): ReactElement {
  return (
    <Screen>
      <ScreenTitle title={t('licenses.title')} />
      <FlatList
        data={LICENSES}
        keyExtractor={(item) => item.name}
        renderItem={({ item }) => <LicenseRow item={item} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, backgroundColor: '#F3F4F6', paddingHorizontal: 4, borderRadius: 6 },
  nameCol: { flex: 1 },
  name: { fontSize: 14 },
  version: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  summaryText: { flex: 1, fontSize: 14, fontWeight: '600' },
  badge: { marginStart: 8, fontSize: 11, color: '#6B7280' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB' },
});
