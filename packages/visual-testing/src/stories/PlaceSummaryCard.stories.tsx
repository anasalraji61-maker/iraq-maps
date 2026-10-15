/**
 * Storybook stories for PlaceSummaryCard.
 */
import type { Meta, StoryObj } from '@storybook/react-native';
import { PlaceSummaryCard } from '@iraq-maps/ui';
import { action } from '@storybook/addon-actions';

const meta = {
  title: 'UI/PlaceSummaryCard',
  component: PlaceSummaryCard,
  args: {
    onPress: action('card-pressed'),
  },
} satisfies Meta<typeof PlaceSummaryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Restaurant: Story = {
  args: {
    name: 'مطعم الرافدين',
    category: 'مطعم',
    area: 'الكرادة',
    address: 'شارع أبو نواس، الكرادة، بغداد',
    distance: '١٫٢ كم',
    source: 'OpenStreetMap',
  },
};

export const Cafe: Story = {
  args: {
    name: 'كافيه الزيتونة',
    category: 'مقهى',
    area: 'المنصور',
    distance: '٣٠٠ م',
    source: 'OpenStreetMap',
  },
};

export const Hotel: Story = {
  args: {
    name: 'فندق بغداد',
    category: 'فندق',
    area: 'الكرخ',
    address: 'شارع المطار، بغداد',
    source: 'OpenStreetMap',
  },
};

export const Street: Story = {
  args: {
    name: 'شارع الرشيد',
    category: 'شارع',
    source: 'OpenStreetMap',
  },
};

export const NearbyWithDistance: Story = {
  args: {
    name: 'صيدلية النصر',
    category: 'صيدلية',
    area: 'الكرادة',
    distance: '٥٠ م',
    source: 'OpenStreetMap',
  },
};
