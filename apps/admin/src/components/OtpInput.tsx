import { useRef, type ChangeEvent, type KeyboardEvent } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

const boxStyle: React.CSSProperties = {
  width: 44,
  height: 52,
  fontSize: 24,
  textAlign: 'center',
  border: '1px solid #ccc',
  borderRadius: 6,
  outline: 'none',
};

export function OtpInput({ value, onChange }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function handleChange(i: number, e: ChangeEvent<HTMLInputElement>) {
    const digit = e.target.value.replace(/\D/g, '').slice(-1);
    const next = value.split('');
    next[i] = digit;
    onChange(next.join('').padEnd(6, '').slice(0, 6));
    if (digit && i < 5) refs.current[i + 1]?.focus();
  }

  function handleKey(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus();
  }

  return (
    <div style={{ display: 'flex', gap: 8, direction: 'ltr' }}>
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ''}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKey(i, e)}
          style={boxStyle}
        />
      ))}
    </div>
  );
}
