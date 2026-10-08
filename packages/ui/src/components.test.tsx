import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, renderHook, screen, userEvent, waitFor } from '@testing-library/react-native';
import { I18nManager, StyleSheet, Text as RNText } from 'react-native';
import { Banner, Button, type ButtonProps, Card, EmptyState, Icon, IconButton, ListItem, Screen, Sheet, Text, TextField, tokens, useUiFonts } from './index';

const noop = () => undefined;
type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] };
const hostNodes = (node: Node): Node[] => [node, ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostNodes(child)))];
const styleOf = (node: Node) => (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;

describe('Text', () => {
  it('announces titles as headers and colors tones from tokens', async () => {
    await render(
      <>
        <Text variant="title">عنوان</Text>
        <Text tone="danger">خطأ</Text>
      </>,
    );
    expect(screen.getByRole('header', { name: 'عنوان' })).toBeOnTheScreen();
    expect(screen.getByText('خطأ')).toHaveStyle({ color: tokens.color.danger, fontFamily: tokens.font.family });
  });
});

describe('Button', () => {
  it('calls onPress with the label as its accessible name', async () => {
    const onPress = jest.fn();
    await render(<Button label="متابعة" onPress={onPress} />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'متابعة' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each<[string, Partial<ButtonProps>, boolean]>([
    ['disabled', { disabled: true }, false],
    ['loading', { loading: true }, true],
  ])('blocks presses while %s', async (_state, props, busy) => {
    const onPress = jest.fn();
    await render(<Button label="إرسال" onPress={onPress} variant="danger" {...props} />);
    const button = screen.getByRole('button', { name: 'إرسال' });
    expect(button).toBeDisabled();
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('IconButton and Icon', () => {
  it('uses the given accessibility label and keeps the icon hidden from screen readers', async () => {
    const onPress = jest.fn();
    await render(<IconButton icon="settings" accessibilityLabel="الإعدادات" onPress={onPress} />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'الإعدادات' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'الإعدادات' })).toHaveStyle({ minWidth: 48, minHeight: 48 });
  });

  it('mirrors directional icons in RTL only', async () => {
    jest.replaceProperty(I18nManager, 'isRTL', true);
    await render(
      <>
        <Icon name="arrow_back" testID="back" />
        <Icon name="map" testID="map" />
      </>,
    );
    expect(screen.getByTestId('back', { includeHiddenElements: true })).toHaveStyle({ transform: [{ scaleX: -1 }] });
    expect(screen.getByTestId('map', { includeHiddenElements: true })).not.toHaveStyle({ transform: [{ scaleX: -1 }] });
    expect(screen.queryByTestId('back')).not.toBeOnTheScreen();
  });
});

describe('TextField', () => {
  it('names the input by its visible label and reports typed text', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="الاسم" value="" onChangeText={onChangeText} />);
    expect(screen.getByText('الاسم')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('الاسم'), 'علي');
    expect(onChangeText).toHaveBeenCalledWith('علي');
    expect(screen.getByLabelText('الاسم')).not.toHaveStyle({ direction: 'ltr' });
  });

  it('announces errors politely and keeps phone digits left-to-right', async () => {
    await render(<TextField label="رقم الهاتف" value="0770" onChangeText={noop} keyboardType="phone-pad" error="رقم غير صالح" />);
    expect(screen.getByLabelText('رقم الهاتف')).toHaveStyle({ direction: 'ltr', borderColor: tokens.color.danger });
    expect(screen.getByText('رقم غير صالح')).toHaveProp('accessibilityLiveRegion', 'polite');
  });
});

describe('ListItem and Card', () => {
  it('are buttons only when pressable', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <ListItem title="اللغة" subtitle="العربية" onPress={onPress} trailing={<RNText>›</RNText>} />
        <ListItem title="الإصدار" />
        <Card>
          <RNText>بطاقة</RNText>
        </Card>
      </>,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await userEvent.setup().press(screen.getByRole('button', { name: 'اللغة العربية ›' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('presses a card', async () => {
    const onPress = jest.fn();
    await render(
      <Card onPress={onPress}>
        <RNText>مطعم</RNText>
      </Card>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'مطعم' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Sheet', () => {
  it('closes from the backdrop and from Android back', async () => {
    const onClose = jest.fn();
    await render(
      <Sheet visible onClose={onClose} closeLabel="إغلاق" testID="sheet">
        <RNText>محتوى</RNText>
      </Sheet>,
    );
    expect(screen.getByText('محتوى')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'إغلاق' }));
    await fireEvent(hostNodes(screen.container as unknown as Node).find((node) => node.type === 'Modal') as never, 'requestClose');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing when hidden', async () => {
    await render(
      <Sheet visible={false} onClose={noop}>
        <RNText>محتوى</RNText>
      </Sheet>,
    );
    expect(screen.queryByText('محتوى')).not.toBeOnTheScreen();
  });
});

describe('Banner and EmptyState', () => {
  it('announces errors as alerts and other kinds politely', async () => {
    await render(
      <>
        <Banner kind="error" message="تعذر الاتصال" />
        <Banner kind="success" message="تم الحفظ" testID="success" />
      </>,
    );
    expect(screen.getByRole('alert')).toHaveAccessibleName('تعذر الاتصال');
    expect(screen.getByTestId('success')).toHaveProp('accessibilityLiveRegion', 'polite');
  });

  it('shows a header, body and action', async () => {
    const onPress = jest.fn();
    await render(<EmptyState title="قريباً" body="هذه الميزة قيد الإعداد" action={{ label: 'رجوع', onPress }} />);
    expect(screen.getByRole('header', { name: 'قريباً' })).toBeOnTheScreen();
    expect(screen.getByText('هذه الميزة قيد الإعداد')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'رجوع' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Screen', () => {
  it('scrolls on request and keeps taps for children while the keyboard is open', async () => {
    await render(
      <Screen scroll testID="screen">
        <Text>محتوى الشاشة</Text>
      </Screen>,
    );
    expect(screen.getByTestId('screen')).toHaveStyle({ backgroundColor: tokens.color.bg });
    expect(screen.getByText('محتوى الشاشة')).toBeOnTheScreen();
    expect(hostNodes(screen.container as unknown as Node).some((node) => node.props.keyboardShouldPersistTaps === 'handled')).toBe(true);
  });
});

describe('useUiFonts', () => {
  it('reports when Noto Sans Arabic has loaded', async () => {
    const { result } = await renderHook(() => useUiFonts());
    await waitFor(() => expect(result.current).toBe(true));
  });
});

describe('every component', () => {
  it('uses only logical (start/end) styles and 48dp touch targets', async () => {
    await render(
      <Screen>
        <Text variant="subtitle">نص</Text>
        <Button label="زر" onPress={noop} variant="secondary" loading />
        <IconButton icon="arrow_forward" accessibilityLabel="التالي" onPress={noop} />
        <TextField label="بحث" value="" onChangeText={noop} keyboardType="email-address" error="خطأ" />
        <ListItem title="عنصر" onPress={noop} trailing={<Icon name="chevron_left" />} />
        <Card onPress={noop}>
          <Text>بطاقة</Text>
        </Card>
        <Banner kind="info" message="معلومة" />
        <EmptyState title="فارغ" action={{ label: 'إجراء', onPress: noop }} />
        <Sheet visible onClose={noop} closeLabel="إغلاق">
          <Text>ورقة</Text>
        </Sheet>
      </Screen>,
    );
    const nodes = hostNodes(screen.container as unknown as Node);
    const physical = nodes.flatMap((node) => Object.keys(styleOf(node)).filter((key) => /left|right/i.test(key)));
    expect(nodes.some((node) => 'borderStartWidth' in styleOf(node))).toBe(true);
    expect(physical).toEqual([]);
    const pressables = nodes.filter((node) => typeof node.props.onClick === 'function' || node.props.accessibilityRole === 'button');
    // Button, IconButton, ListItem, Card, the EmptyState action and the Sheet backdrop.
    expect(pressables).toHaveLength(6);
    for (const node of pressables) expect(styleOf(node).minHeight).toBeGreaterThanOrEqual(tokens.minTouch);
  });
});
