import { describe, expect, it } from '@jest/globals';
import { testIDs } from '@iraq-maps/contracts';
import { setLocale } from '@iraq-maps/i18n';
import { act, screen, userEvent } from '@testing-library/react-native';
import { renderApp, routesNow } from './test/app';

const labels = {
  ar: { map: 'الخريطة', discover: 'اكتشف', messages: 'مراسلات', activity: 'نشاطي', account: 'حسابي' },
  ckb: { map: 'نەخشە', discover: 'دۆزینەوە', messages: 'نامەکان', activity: 'چالاکییەکانم', account: 'هەژمارەکەم' },
  en: { map: 'Map', discover: 'Discover', messages: 'Messages', activity: 'Activity', account: 'Account' },
};
const tabs = Object.keys(labels.ar) as (keyof typeof labels.ar)[];

const expectTabLabels = (locale: keyof typeof labels) => {
  for (const tab of tabs) expect(screen.getByTestId(testIDs.tabs[tab])).toHaveAccessibleName(labels[locale][tab]);
};

describe('TabsLayout', () => {
  it('shows the five tabs in order with Arabic labels from i18n', async () => {
    await renderApp('/', routesNow);
    await screen.findByTestId(testIDs.tabs.map);
    expectTabLabels('ar');
    expect(screen.getAllByRole('button').map((button) => button.props.testID).filter(Boolean)).toEqual(tabs.map((tab) => testIDs.tabs[tab]));
  });

  it('relabels the tabs and the header as soon as the locale changes', async () => {
    await renderApp('/', routesNow);
    await screen.findByTestId(testIDs.tabs.map);
    await act(async () => setLocale('en'));
    expectTabLabels('en');
    expect(screen.getByRole('heading', { name: 'Map' })).toBeOnTheScreen();
    await act(async () => setLocale('ckb'));
    expectTabLabels('ckb');
  });
});

describe('PendingScreen', () => {
  it.each([
    ['/', 'الخريطة قيد الإعداد', 'تصفّح الخريطة والبحث عن الأماكن يصلان في تحديث قادم.'],
    ['/discover', 'اكتشف قيد الإعداد', 'صور المدينة وأماكنها من أصحاب الأعمال والمستخدمين تصل في تحديث قادم.'],
    ['/messages', 'المراسلات قيد الإعداد', 'مراسلة الأماكن ومتابعة ردودها تصلان في تحديث قادم.'],
    ['/activity', 'نشاطي قيد الإعداد', 'أماكنك المحفوظة ومساراتك الأخيرة تظهر هنا في تحديث قادم.'],
    ['/account', 'حسابي قيد الإعداد', 'تسجيل الدخول وإعدادات الحساب تصل في تحديث قادم.'],
  ])('explains on %s that the feature arrives in a later update', async (url, title, body) => {
    await renderApp(url, routesNow);
    expect(await screen.findByRole('header', { name: title })).toBeOnTheScreen();
    expect(screen.getByText(body)).toBeOnTheScreen();
  });

  it('follows the tab the user presses', async () => {
    await renderApp('/', routesNow);
    await userEvent.setup().press(await screen.findByTestId(testIDs.tabs.messages));
    expect(await screen.findByRole('header', { name: 'المراسلات قيد الإعداد' })).toBeOnTheScreen();
  });
});
