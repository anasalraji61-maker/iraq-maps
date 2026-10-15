/**
 * Storybook stories for EmptyState.
 */
import type { Meta, StoryObj } from '@storybook/react-native';
import { EmptyState } from '@iraq-maps/ui';
import { action } from '@storybook/addon-actions';

const meta = {
  title: 'UI/EmptyState',
  component: EmptyState,
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoResults: Story = {
  args: {
    title: 'لا توجد نتائج',
    body: 'جرّب كلمات بحث مختلفة',
  },
};

export const NoNotifications: Story = {
  args: {
    title: 'لا توجد إشعارات',
    body: 'ستظهر هنا إشعاراتك الجديدة',
  },
};

export const WithAction: Story = {
  args: {
    title: 'لا توجد محادثات',
    body: 'ابدأ محادثة مع مزود خدمة',
    action: { label: 'ابحث عن مزود', onPress: action('cta-pressed') },
  },
};

export const NoDiscoverPosts: Story = {
  args: {
    title: 'لا يوجد محتوى بعد',
    body: 'كن أول من ينشر في هذه المنطقة',
    action: { label: 'إنشاء منشور', onPress: action('create-post') },
  },
};
