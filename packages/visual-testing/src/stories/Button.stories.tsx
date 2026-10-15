/**
 * Storybook stories for the Button component.
 * Each story exercises a distinct visual variant or state.
 */
import type { Meta, StoryObj } from '@storybook/react-native';
import { Button } from '@iraq-maps/ui';
import { action } from '@storybook/addon-actions';

const meta = {
  title: 'UI/Button',
  component: Button,
  args: {
    onPress: action('pressed'),
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { label: 'بحث', variant: 'primary' },
};

export const Secondary: Story = {
  args: { label: 'إلغاء', variant: 'secondary' },
};

export const Danger: Story = {
  args: { label: 'حذف الحساب', variant: 'danger' },
};

export const Loading: Story = {
  args: { label: 'جاري الحفظ...', loading: true },
};

export const Disabled: Story = {
  args: { label: 'غير متاح', disabled: true },
};

export const LongLabel: Story = {
  args: { label: 'تسجيل كمزود خدمة والانضمام إلى المنصة', variant: 'primary' },
};
