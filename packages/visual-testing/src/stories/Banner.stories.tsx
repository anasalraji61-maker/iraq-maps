/**
 * Storybook stories for the Banner component (info / success / error).
 */
import type { Meta, StoryObj } from '@storybook/react-native';
import { Banner } from '@iraq-maps/ui';
import { action } from '@storybook/addon-actions';

const meta = {
  title: 'UI/Banner',
  component: Banner,
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {
  args: { kind: 'info', message: 'جاري تحميل البيانات...' },
};

export const Success: Story = {
  args: { kind: 'success', message: 'تم حفظ التغييرات بنجاح' },
};

export const Error: Story = {
  args: { kind: 'error', message: 'تعذر الاتصال بالخادم' },
};

export const ErrorWithRetry: Story = {
  args: {
    kind: 'error',
    message: 'حدث خطأ أثناء تحميل البيانات',
    onRetry: action('retry'),
    retryLabel: 'إعادة المحاولة',
  },
};

export const LongMessage: Story = {
  args: {
    kind: 'info',
    message:
      'لقد تم تحديث شروط الخدمة. يرجى مراجعة الشروط الجديدة والموافقة عليها لمواصلة استخدام التطبيق.',
  },
};
