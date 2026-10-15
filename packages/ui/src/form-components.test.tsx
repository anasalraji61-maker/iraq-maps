import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { DatePicker, MultiSelect, PhoneInput, PriceInput, RatingStars, TagInput, TimePicker } from './form-components';

describe('PhoneInput', () => {
  it('renders input with default Iraq code', async () => {
    const { getByText } = await render(<PhoneInput value="" onChangeText={() => {}} />);
    expect(getByText('+964')).toBeTruthy();
  });

  it('renders label and error', async () => {
    const { getByText } = await render(
      <PhoneInput value="" onChangeText={() => {}} label="الهاتف" error="رقم غير صحيح" />
    );
    expect(getByText('الهاتف')).toBeTruthy();
    expect(getByText('رقم غير صحيح')).toBeTruthy();
  });

  it('calls onChangeText', async () => {
    const fn = jest.fn();
    const { getByTestId } = await render(<PhoneInput value="" onChangeText={fn} testID="phone" />);
    await fireEvent.changeText(getByTestId('phone'), '07701234567');
    expect(fn).toHaveBeenCalledWith('07701234567');
  });

  it('has displayName', () => {
    expect(PhoneInput.displayName).toBe('PhoneInput');
  });
});

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

describe('DatePicker', () => {
  it('renders label', async () => {
    const { getByText } = await render(<DatePicker value={null} onChange={() => {}} label="label" monthNames={MONTHS} dayNames={DAYS} />);
    expect(getByText('label')).toBeTruthy();
  });

  it('renders placeholder when no value', async () => {
    const { getByText } = await render(<DatePicker value={null} onChange={() => {}} monthNames={MONTHS} dayNames={DAYS} />);
    expect(getByText('-- -- ----')).toBeTruthy();
  });

  it('has displayName', () => {
    expect(DatePicker.displayName).toBe('DatePicker');
  });
});

describe('TimePicker', () => {
  it('renders hour and minute', async () => {
    const { getByText } = await render(<TimePicker hour={9} minute={30} onChange={() => {}} />);
    expect(getByText('09')).toBeTruthy();
    expect(getByText('30')).toBeTruthy();
  });

  it('increments hour on press', async () => {
    const fn = jest.fn();
    const { getAllByRole } = await render(<TimePicker hour={9} minute={30} onChange={fn} />);
    const buttons = getAllByRole('button');
    await fireEvent.press(buttons[0]!);
    expect(fn).toHaveBeenCalledWith(10, 30);
  });

  it('has displayName', () => {
    expect(TimePicker.displayName).toBe('TimePicker');
  });
});

describe('MultiSelect', () => {
  const opts = [
    { value: 'a', label: 'الخيار أ' },
    { value: 'b', label: 'الخيار ب' },
  ];

  it('renders placeholder when nothing selected', async () => {
    const { getByText } = await render(
      <MultiSelect options={opts} selected={[]} onChangeSelected={() => {}} placeholder="اختر..." />
    );
    expect(getByText('اختر...')).toBeTruthy();
  });

  it('renders selected labels', async () => {
    const { getByText } = await render(
      <MultiSelect options={opts} selected={['a']} onChangeSelected={() => {}} />
    );
    expect(getByText('الخيار أ')).toBeTruthy();
  });

  it('has displayName', () => {
    expect(MultiSelect.displayName).toBe('MultiSelect');
  });
});

describe('PriceInput', () => {
  it('renders IQD currency by default', async () => {
    const { getByText } = await render(<PriceInput value="" onChangeText={() => {}} />);
    expect(getByText('IQD')).toBeTruthy();
  });

  it('renders error', async () => {
    const { getByText } = await render(
      <PriceInput value="" onChangeText={() => {}} error="قيمة غير صحيحة" />
    );
    expect(getByText('قيمة غير صحيحة')).toBeTruthy();
  });

  it('calls onCurrencyChange', async () => {
    const fn = jest.fn();
    const { getByRole } = await render(
      <PriceInput value="" onChangeText={() => {}} currency="IQD" onCurrencyChange={fn} />
    );
    await fireEvent.press(getByRole('button'));
    expect(fn).toHaveBeenCalledWith('USD');
  });

  it('has displayName', () => {
    expect(PriceInput.displayName).toBe('PriceInput');
  });
});

describe('RatingStars', () => {
  it('renders 5 stars', async () => {
    const { getAllByRole } = await render(<RatingStars value={3} onChange={() => {}} />);
    const stars = getAllByRole('button');
    expect(stars).toHaveLength(5);
  });

  it('calls onChange with correct value', async () => {
    const fn = jest.fn();
    const { getAllByRole } = await render(<RatingStars value={0} onChange={fn} />);
    await fireEvent.press(getAllByRole('button')[2]!);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it('renders as readonly (no buttons)', async () => {
    const { queryAllByRole } = await render(<RatingStars value={4} readonly />);
    expect(queryAllByRole('button')).toHaveLength(0);
  });

  it('has displayName', () => {
    expect(RatingStars.displayName).toBe('RatingStars');
  });
});

describe('TagInput', () => {
  it('renders existing tags', async () => {
    const { getByText } = await render(
      <TagInput tags={['علامة']} onChangeTags={() => {}} />
    );
    expect(getByText('علامة')).toBeTruthy();
  });

  it('renders label', async () => {
    const { getByText } = await render(
      <TagInput tags={[]} onChangeTags={() => {}} label="العلامات" />
    );
    expect(getByText('العلامات')).toBeTruthy();
  });

  it('removes tag on press', async () => {
    const fn = jest.fn();
    const { getByRole } = await render(
      <TagInput tags={['بغداد']} onChangeTags={fn} />
    );
    await fireEvent.press(getByRole('button'));
    expect(fn).toHaveBeenCalledWith([]);
  });

  it('has displayName', () => {
    expect(TagInput.displayName).toBe('TagInput');
  });
});
