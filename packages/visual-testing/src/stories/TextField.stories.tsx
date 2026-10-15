/**
 * Storybook stories for the TextField component.
 */
import type { Meta, StoryObj } from '@storybook/react-native';
import { TextField } from '@iraq-maps/ui';

const meta = {
  title: 'UI/TextField',
  component: TextField,
  args: {
    value: '',
    onChangeText: () => undefined,
  },
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: 'رقم الهاتف', placeholder: '07XX XXX XXXX' },
};

export const WithValue: Story = {
  args: { label: 'الاسم', value: 'زينب العراقي' },
};

export const WithError: Story = {
  args: { label: 'رقم الهاتف', value: '0770', error: 'رقم الهاتف غير صحيح' },
};

export const PhoneNumber: Story = {
  args: {
    label: 'رقم الهاتف',
    value: '+9647701234567',
    keyboardType: 'phone-pad',
    direction: 'ltr',
  },
};

export const SearchBox: Story = {
  args: {
    label: 'البحث',
    placeholder: 'ابحث عن مطعم أو متجر...',
    accessibilityRole: 'searchbox',
  },
};
