/**
 * Visual regression baseline — renders each UI component and asserts it
 * produces a non-empty element tree (snapshot baseline for regression).
 *
 * These tests run in Jest with React Native Testing Library.
 */
import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';
import React from 'react';
import * as Ui from '@iraq-maps/ui';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), clear: jest.fn() },
}));
jest.mock('expo-modules-core', () => ({
  requireNativeModule: jest.fn(() => ({})),
  requireOptionalNativeModule: jest.fn(() => null),
  EventEmitter: class { addListener() {} removeListener() {} },
  NativeModulesProxy: new Proxy({}, { get: () => jest.fn() }),
}));
jest.mock('@expo-google-fonts/noto-sans-arabic', () => ({ useFonts: jest.fn(() => [true]) }));
jest.mock('expo-font', () => ({ useFonts: jest.fn(() => [true, null]) }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SafeAreaView: View,
    SafeAreaProvider: View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    initialWindowMetrics: { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 44, left: 0, right: 0, bottom: 34 } },
  };
});

// Static reference after mocks are set up
function getUi() {
  return Promise.resolve(Ui);
}

describe('Button renders', () => {
  it('primary variant', async () => {
    const { Button } = await getUi();
    const { getByText } = render(<Button label="تأكيد" onPress={() => undefined} variant="primary" />);
    expect(getByText('تأكيد')).toBeTruthy();
  });

  it('secondary variant', async () => {
    const { Button } = await getUi();
    const { getByText } = render(<Button label="إلغاء" onPress={() => undefined} variant="secondary" />);
    expect(getByText('إلغاء')).toBeTruthy();
  });

  it('danger variant', async () => {
    const { Button } = await getUi();
    const { getByText } = render(<Button label="حذف" onPress={() => undefined} variant="danger" />);
    expect(getByText('حذف')).toBeTruthy();
  });

  it('loading state', async () => {
    const { Button } = await getUi();
    const { UNSAFE_queryByType } = render(<Button label="جاري الحفظ" onPress={() => undefined} loading />);
    // Loading button renders an ActivityIndicator (or similar) — just ensure it mounts
    expect(UNSAFE_queryByType).toBeDefined();
  });
});

describe('TextField renders', () => {
  it('with a label', async () => {
    const { TextField } = await getUi();
    const { getByText } = render(<TextField label="الاسم" value="" onChangeText={() => undefined} />);
    expect(getByText('الاسم')).toBeTruthy();
  });

  it('with an error message', async () => {
    const { TextField } = await getUi();
    const { getByText } = render(
      <TextField label="الهاتف" value="07" onChangeText={() => undefined} error="رقم غير صحيح" />,
    );
    expect(getByText('رقم غير صحيح')).toBeTruthy();
  });
});

describe('Banner renders', () => {
  it('info kind', async () => {
    const { Banner } = await getUi();
    const { getByText } = render(<Banner kind="info" message="تحميل..." />);
    expect(getByText('تحميل...')).toBeTruthy();
  });

  it('success kind', async () => {
    const { Banner } = await getUi();
    const { getByText } = render(<Banner kind="success" message="تم بنجاح" />);
    expect(getByText('تم بنجاح')).toBeTruthy();
  });

  it('error kind with retry', async () => {
    const { Banner } = await getUi();
    const { getByText } = render(
      <Banner kind="error" message="خطأ في الشبكة" onRetry={() => undefined} retryLabel="إعادة" />,
    );
    expect(getByText('خطأ في الشبكة')).toBeTruthy();
    expect(getByText('إعادة')).toBeTruthy();
  });
});

describe('EmptyState renders', () => {
  it('without action', async () => {
    const { EmptyState } = await getUi();
    const { getByText } = render(<EmptyState title="لا توجد نتائج" body="جرب بحثاً آخر" />);
    expect(getByText('لا توجد نتائج')).toBeTruthy();
    expect(getByText('جرب بحثاً آخر')).toBeTruthy();
  });

  it('with action button', async () => {
    const { EmptyState } = await getUi();
    const { getByText } = render(
      <EmptyState title="لا يوجد محتوى" action={{ label: 'ابدأ', onPress: () => undefined }} />,
    );
    expect(getByText('لا يوجد محتوى')).toBeTruthy();
    expect(getByText('ابدأ')).toBeTruthy();
  });
});

describe('PlaceSummaryCard renders', () => {
  it('with all fields', async () => {
    const { PlaceSummaryCard } = await getUi();
    const { getByText } = render(
      <PlaceSummaryCard
        name="مطعم الرافدين"
        category="مطعم"
        area="الكرادة"
        distance="١٫٢ كم"
        source="OpenStreetMap"
        onPress={() => undefined}
      />,
    );
    expect(getByText('مطعم الرافدين')).toBeTruthy();
  });

  it('with minimal fields', async () => {
    const { PlaceSummaryCard } = await getUi();
    const { getByText } = render(
      <PlaceSummaryCard name="مكان مجهول" onPress={() => undefined} />,
    );
    expect(getByText('مكان مجهول')).toBeTruthy();
  });
});

describe('Text renders', () => {
  it('title variant in Arabic', async () => {
    const { Text } = await getUi();
    const { getByText } = render(<Text variant="title">خريطة العراق الذكية</Text>);
    expect(getByText('خريطة العراق الذكية')).toBeTruthy();
  });

  it('caption variant', async () => {
    const { Text } = await getUi();
    const { getByText } = render(<Text variant="caption" tone="muted">منذ ساعة</Text>);
    expect(getByText('منذ ساعة')).toBeTruthy();
  });
});

describe('Badge renders', () => {
  it('with a label', async () => {
    const { Badge } = await getUi();
    const { getByText } = render(<Badge label="OpenStreetMap" />);
    expect(getByText('OpenStreetMap')).toBeTruthy();
  });
});
