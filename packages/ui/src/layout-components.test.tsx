import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { ActionBar, AppModal, BottomSheet, CardCarousel, SideDrawer, Stepper } from './layout-components';

describe('BottomSheet', () => {
  it('renders children when visible', async () => {
    const { getByText } = await render(
      <BottomSheet visible onClose={() => {}}>
        <Text>المحتوى</Text>
      </BottomSheet>
    );
    expect(getByText('المحتوى')).toBeTruthy();
  });

  it('does not render children when not visible', async () => {
    const { queryByText } = await render(
      <BottomSheet visible={false} onClose={() => {}}>
        <Text>المحتوى</Text>
      </BottomSheet>
    );
    expect(queryByText('المحتوى')).toBeNull();
  });

  it('has displayName', () => {
    expect(BottomSheet.displayName).toBe('BottomSheet');
  });
});

describe('AppModal', () => {
  it('renders dialog with title', async () => {
    const { getByText } = await render(
      <AppModal visible onClose={() => {}} title="عنوان النافذة" size="dialog">
        <Text>المحتوى</Text>
      </AppModal>
    );
    expect(getByText('عنوان النافذة')).toBeTruthy();
    expect(getByText('المحتوى')).toBeTruthy();
  });

  it('renders fullscreen modal', async () => {
    const { getByText } = await render(
      <AppModal visible onClose={() => {}} title="الصفحة الكاملة" size="fullscreen">
        <Text>محتوى كامل</Text>
      </AppModal>
    );
    expect(getByText('الصفحة الكاملة')).toBeTruthy();
  });

  it('does not render when not visible', async () => {
    const { queryByText } = await render(
      <AppModal visible={false} onClose={() => {}}>
        <Text>لا أحد</Text>
      </AppModal>
    );
    expect(queryByText('لا أحد')).toBeNull();
  });

  it('has displayName', () => {
    expect(AppModal.displayName).toBe('AppModal');
  });
});

describe('SideDrawer', () => {
  it('renders children when visible', async () => {
    const { getByText } = await render(
      <SideDrawer visible onClose={() => {}}>
        <Text>القائمة الجانبية</Text>
      </SideDrawer>
    );
    expect(getByText('القائمة الجانبية')).toBeTruthy();
  });

  it('has displayName', () => {
    expect(SideDrawer.displayName).toBe('SideDrawer');
  });
});

describe('ActionBar', () => {
  const actions = [
    { key: 'a', label: 'حفظ', onPress: jest.fn() },
    { key: 'b', label: 'إلغاء', onPress: jest.fn() },
  ];

  it('renders action labels', async () => {
    const { getByText } = await render(<ActionBar actions={actions} />);
    expect(getByText('حفظ')).toBeTruthy();
    expect(getByText('إلغاء')).toBeTruthy();
  });

  it('has displayName', () => {
    expect(ActionBar.displayName).toBe('ActionBar');
  });
});

describe('Stepper', () => {
  const steps = [
    { key: '1', label: 'الأول', state: 'completed' as const },
    { key: '2', label: 'الثاني', state: 'active' as const },
    { key: '3', label: 'الثالث', state: 'upcoming' as const },
  ];

  it('renders step labels', async () => {
    const { getByText } = await render(<Stepper steps={steps} />);
    expect(getByText('الأول')).toBeTruthy();
    expect(getByText('الثاني')).toBeTruthy();
    expect(getByText('الثالث')).toBeTruthy();
  });

  it('shows checkmark for completed steps', async () => {
    const { getByText } = await render(<Stepper steps={steps} />);
    expect(getByText('✓')).toBeTruthy();
  });

  it('has displayName', () => {
    expect(Stepper.displayName).toBe('Stepper');
  });
});

describe('CardCarousel', () => {
  const data = [
    { key: '1', content: <Text>بطاقة ١</Text> },
    { key: '2', content: <Text>بطاقة ٢</Text> },
  ];

  it('renders card content', async () => {
    const { getByText } = await render(<CardCarousel data={data} />);
    expect(getByText('بطاقة ١')).toBeTruthy();
    expect(getByText('بطاقة ٢')).toBeTruthy();
  });

  it('has displayName', () => {
    expect(CardCarousel.displayName).toBe('CardCarousel');
  });
});
