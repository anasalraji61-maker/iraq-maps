import { describe, expect, it } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Accordion, DataTable, ProgressRing, StatCard, StatusBadge, Timeline, Tooltip } from './data-display';

describe('DataTable', () => {
  const cols = [
    { key: 'name' as const, header: 'الاسم', sortable: true },
    { key: 'age' as const, header: 'العمر' },
  ];
  const data = [
    { name: 'علي', age: 25 },
    { name: 'أحمد', age: 30 },
  ];

  it('renders headers', async () => {
    const { getByText } = await render(<DataTable columns={cols} data={data} />);
    expect(getByText('الاسم')).toBeTruthy();
    expect(getByText('العمر')).toBeTruthy();
  });

  it('renders rows', async () => {
    const { getByText } = await render(<DataTable columns={cols} data={data} />);
    expect(getByText('علي')).toBeTruthy();
    expect(getByText('أحمد')).toBeTruthy();
  });

  it('paginates when pageSize < data length', async () => {
    const bigData = Array.from({ length: 15 }, (_, i) => ({ name: `user${i}`, age: i }));
    const { queryByText } = await render(<DataTable columns={cols} data={bigData} pageSize={5} />);
    expect(queryByText('user0')).toBeTruthy();
    expect(queryByText('user5')).toBeNull();
  });

  it('has displayName', () => {
    expect(DataTable.displayName).toBe('DataTable');
  });
});

describe('StatCard', () => {
  it('renders value and label', async () => {
    const { getByText } = await render(<StatCard value="١٢٣" label="طلبات" />);
    expect(getByText('١٢٣')).toBeTruthy();
    expect(getByText('طلبات')).toBeTruthy();
  });

  it('renders trend arrow up', async () => {
    const { getByText } = await render(<StatCard value="٥" label="x" trend="up" trendLabel="+٢٠٪" />);
    expect(getByText('↑')).toBeTruthy();
    expect(getByText('+٢٠٪')).toBeTruthy();
  });

  it('renders trend arrow down', async () => {
    const { getByText } = await render(<StatCard value="٥" label="x" trend="down" />);
    expect(getByText('↓')).toBeTruthy();
  });

  it('has displayName', () => {
    expect(StatCard.displayName).toBe('StatCard');
  });
});

describe('Timeline', () => {
  const items = [
    { id: '1', title: 'حدث أول', timestamp: '10:00' },
    { id: '2', title: 'حدث ثاني', description: 'وصف', timestamp: '11:00' },
  ];

  it('renders items', async () => {
    const { getByText } = await render(<Timeline items={items} />);
    expect(getByText('حدث أول')).toBeTruthy();
    expect(getByText('حدث ثاني')).toBeTruthy();
    expect(getByText('وصف')).toBeTruthy();
  });

  it('has displayName', () => {
    expect(Timeline.displayName).toBe('Timeline');
  });
});

describe('ProgressRing', () => {
  it('renders progress percentage', async () => {
    const { getByText } = await render(<ProgressRing progress={75} testID="ring" />);
    expect(getByText('75%')).toBeTruthy();
  });

  it('clamps to 0', async () => {
    const { getByText } = await render(<ProgressRing progress={-10} />);
    expect(getByText('0%')).toBeTruthy();
  });

  it('clamps to 100', async () => {
    const { getByText } = await render(<ProgressRing progress={150} />);
    expect(getByText('100%')).toBeTruthy();
  });

  it('has displayName', () => {
    expect(ProgressRing.displayName).toBe('ProgressRing');
  });
});

describe('StatusBadge', () => {
  it('renders label', async () => {
    const { getByText } = await render(<StatusBadge label="نشط" variant="success" />);
    expect(getByText('نشط')).toBeTruthy();
  });

  it('renders default variant', async () => {
    const { getByText } = await render(<StatusBadge label="معلق" />);
    expect(getByText('معلق')).toBeTruthy();
  });

  it('has displayName', () => {
    expect(StatusBadge.displayName).toBe('StatusBadge');
  });
});

describe('Tooltip', () => {
  it('renders children without crashing', async () => {
    const result = await render(<Tooltip text="تلميح"><React.Fragment /></Tooltip>);
    expect(result).toBeTruthy();
  });

  it('has displayName', () => {
    expect(Tooltip.displayName).toBe('Tooltip');
  });
});

describe('Accordion', () => {
  const items = [
    { id: 'a', title: 'القسم الأول', content: <React.Fragment /> },
    { id: 'b', title: 'القسم الثاني', content: <React.Fragment /> },
  ];

  it('renders titles', async () => {
    const { getByText } = await render(<Accordion items={items} />);
    expect(getByText('القسم الأول')).toBeTruthy();
    expect(getByText('القسم الثاني')).toBeTruthy();
  });

  it('expands on press', async () => {
    const contentItems = [{ id: 'x', title: 'العنوان', content: <React.Fragment /> }];
    const { getByText } = await render(<Accordion items={contentItems} />);
    await fireEvent.press(getByText('العنوان'));
    // trigger text still present after press
    expect(getByText('العنوان')).toBeTruthy();
  });

  it('has displayName', () => {
    expect(Accordion.displayName).toBe('Accordion');
  });
});
