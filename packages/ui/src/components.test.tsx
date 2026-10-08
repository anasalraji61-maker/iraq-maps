import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, I18nManager } from 'react-native';
import { Badge, Banner, Button, Card, EmptyState, IconButton, ListItem, PlaceSummaryCard, Screen, Sheet, Text, TextField } from './index';

const touch = { minHeight: 48 };

describe('Button', () => {
  it('is an accessible button of at least 48dp that calls onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="متابعة" onPress={onPress} testID="go" />);
    const button = screen.getByRole('button', { name: 'متابعة' });
    expect(button).toHaveStyle(touch);
    expect(button.props.testID).toBe('go');
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses while disabled or loading', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <Button label="حفظ" onPress={onPress} disabled />
        <Button label="إرسال" onPress={onPress} loading variant="danger" />
      </>,
    );
    const disabled = screen.getByRole('button', { name: 'حفظ' });
    const loading = screen.getByRole('button', { name: 'إرسال' });
    expect(disabled).toBeDisabled();
    expect(loading).toBeDisabled();
    expect(loading).toBeBusy();
    await fireEvent.press(disabled);
    await fireEvent.press(loading);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('TextField', () => {
  it('labels the input, forwards typing and announces the error', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="رقم الهاتف" value="" onChangeText={onChangeText} keyboardType="phone-pad" error="رقم غير صالح" testID="phone" />);
    const input = screen.getByLabelText('رقم الهاتف');
    expect(input.props.testID).toBe('phone');
    expect(input).toHaveStyle(touch);
    await fireEvent.changeText(input, '07701234567');
    expect(onChangeText).toHaveBeenCalledWith('07701234567');
    expect(screen.getByText('رقم غير صالح')).toBeOnTheScreen();
    expect(input.props.accessibilityHint).toBe('رقم غير صالح');
    expect(input).not.toHaveStyle({ direction: 'ltr' });
  });

  it('keeps phone numbers left-to-right and passes autofill hints through', async () => {
    await render(<TextField label="رقم الهاتف" value="0770 123 4567" onChangeText={() => {}} direction="ltr" autoComplete="tel" textContentType="telephoneNumber" />);
    const input = screen.getByLabelText('رقم الهاتف');
    expect(input).toHaveStyle({ direction: 'ltr', writingDirection: 'ltr' });
    expect(input.props).toMatchObject({ value: '0770 123 4567', autoComplete: 'tel', textContentType: 'telephoneNumber' });
  });
});

describe('announcements', () => {
  it('announces a TextField error when it appears or changes, and a Banner when shown', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear(); // the RN jest mock is shared and already saw earlier tests' errors
    const field = (error?: string) => <TextField label="الرمز" value="" onChangeText={() => {}} error={error} />;
    const { rerender } = await render(field());
    expect(announce).not.toHaveBeenCalled();
    await rerender(field('الرمز غير صحيح'));
    await rerender(field('الرمز غير صحيح'));
    await rerender(field('انتهت صلاحية الرمز'));
    expect(announce.mock.calls).toEqual([['الرمز غير صحيح'], ['انتهت صلاحية الرمز']]);
    await rerender(<Banner kind="success" message="تم الحفظ" />);
    expect(announce).toHaveBeenLastCalledWith('تم الحفظ');
    announce.mockRestore();
  });
});

describe('ListItem and Card', () => {
  it('exposes a selectable row as a checked or unchecked radio', async () => {
    await render(
      <>
        <ListItem title="العربية" selected onPress={() => {}} />
        <ListItem title="English" selected={false} onPress={() => {}} />
      </>,
    );
    expect(screen.getByRole('radio', { name: 'العربية' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'English' })).not.toBeChecked();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('exposes a disabled row and ignores its presses', async () => {
    const onPress = jest.fn();
    await render(<ListItem title="کوردی" selected={false} disabled onPress={onPress} />);
    const row = screen.getByRole('radio', { name: 'کوردی' });
    expect(row).toBeDisabled();
    expect(row).not.toBeChecked();
    await fireEvent.press(row);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a check mark and a highlighted background only on the selected row', async () => {
    await render(
      <>
        <ListItem testID="ar" title="العربية" selected onPress={() => {}} />
        <ListItem testID="en" title="English" selected={false} onPress={() => {}} />
        <ListItem testID="plain" title="الإصدار" onPress={() => {}} />
      </>,
    );
    const hidden = { includeHiddenElements: true };
    // Visual only: screen readers get the radio's checked state instead.
    expect(screen.queryByTestId('ar.selected')).toBeNull();
    expect(screen.getByTestId('ar.selected', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('ar')).toHaveStyle({ backgroundColor: '#F3F5F7', borderStartColor: '#0A6B4B' });
    for (const id of ['en', 'plain']) {
      expect(screen.queryByTestId(`${id}.selected`, hidden)).toBeNull();
      expect(screen.getByTestId(id)).not.toHaveStyle({ backgroundColor: '#F3F5F7' });
    }
  });

  it('are buttons only when pressable', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <ListItem title="اللغة" subtitle="العربية" onPress={onPress} trailing={<Text>›</Text>} />
        <ListItem title="الإصدار" />
        <Card onPress={onPress}>
          <Text>بطاقة</Text>
        </Card>
      </>,
    );
    const item = screen.getByRole('button', { name: /اللغة/ });
    expect(item).toHaveStyle(touch);
    expect(screen.getByText('العربية')).toBeOnTheScreen();
    await fireEvent.press(item);
    await fireEvent.press(screen.getByRole('button', { name: 'بطاقة' }));
    expect(onPress).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'الإصدار' })).toBeNull();
  });
});

describe('PlaceSummaryCard and Badge', () => {
  it('is one 48dp button named by all of its texts', async () => {
    const onPress = jest.fn();
    await render(
      <PlaceSummaryCard testID="result" name="قلعة بغداد" category="سياحة" area="الرصافة" distance="١٫٢ كم" source="OpenStreetMap" onPress={onPress} />,
    );
    const card = screen.getByRole('button');
    expect(card.props.testID).toBe('result');
    expect(card).toHaveAccessibleName(/قلعة بغداد.*١٫٢ كم.*سياحة · الرصافة.*OpenStreetMap/);
    expect(card).toHaveStyle(touch);
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('leaves out the parts it was not given', async () => {
    await render(<PlaceSummaryCard name="شارع الرشيد" category="شارع" onPress={() => {}} />);
    expect(screen.getByRole('button')).toHaveAccessibleName('شارع الرشيد شارع');
  });

  it('renders a badge as an outlined caption', async () => {
    await render(<Badge label="من OpenStreetMap" testID="source" />);
    expect(screen.getByTestId('source')).toHaveTextContent('من OpenStreetMap');
    expect(screen.getByTestId('source')).toHaveStyle({ borderWidth: 1, color: '#545B64' });
  });
});

describe('Sheet', () => {
  it('shows its content only when visible and closes on back or escape', async () => {
    const onClose = jest.fn();
    const { rerender } = await render(
      <Sheet visible={false} onClose={onClose} testID="sheet">
        <Text>محتوى</Text>
      </Sheet>,
    );
    expect(screen.queryByText('محتوى')).toBeNull();
    await rerender(
      <Sheet visible onClose={onClose} testID="sheet">
        <Text>محتوى</Text>
      </Sheet>,
    );
    expect(screen.getByTestId('sheet')).toBeOnTheScreen();
    await fireEvent(screen.getByTestId('sheet'), 'accessibilityEscape');
    await fireEvent(screen.root!, 'requestClose');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('Banner, EmptyState, Text, Screen', () => {
  it('announces errors as alerts', async () => {
    await render(<Banner kind="error" message="تعذّر الاتصال" testID="banner" />);
    expect(screen.getByRole('alert')).toHaveTextContent('تعذّر الاتصال');
  });

  it('renders an empty state with a header and an optional action', async () => {
    const onPress = jest.fn();
    await render(
      <Screen scroll testID="screen">
        <EmptyState title="قريباً" body="نعمل على هذه الميزة" action={{ label: 'إعادة المحاولة', onPress }} testID="empty" />
      </Screen>,
    );
    expect(screen.getByTestId('screen')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'قريباً' })).toBeOnTheScreen();
    expect(screen.getByText('نعمل على هذه الميزة')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('empty.action'));
    expect(onPress).toHaveBeenCalled();
  });

  it('marks titles as headers and colors tones', async () => {
    await render(
      <>
        <Text variant="title">عنوان</Text>
        <Text tone="danger">خطأ</Text>
      </>,
    );
    expect(screen.getByRole('header', { name: 'عنوان' })).toBeOnTheScreen();
    expect(screen.getByText('خطأ')).toHaveStyle({ color: '#B3261E' });
  });
});

describe('IconButton', () => {
  it('is a labelled 48dp button', async () => {
    const onPress = jest.fn();
    await render(<IconButton icon="close" accessibilityLabel="إغلاق" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'إغلاق' });
    expect(button).toHaveStyle({ width: 48, height: 48 });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalled();
  });

  it('mirrors directional icons in RTL', async () => {
    const rtl = jest.replaceProperty(I18nManager, 'isRTL', true);
    const { rerender } = await render(<IconButton icon="arrow_back" accessibilityLabel="رجوع" onPress={() => {}} />);
    expect(JSON.stringify(screen.toJSON())).toContain('"scaleX":-1');
    await rerender(<IconButton icon="close" accessibilityLabel="إغلاق" onPress={() => {}} />);
    expect(JSON.stringify(screen.toJSON())).not.toContain('scaleX');
    rtl.restore();
  });
});
