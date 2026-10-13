import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { OtpInput } from '../components/OtpInput';

const cardStyle: React.CSSProperties = {
  maxWidth: 400,
  margin: '80px auto',
  padding: 32,
  border: '1px solid #ddd',
  borderRadius: 8,
  background: '#fff',
  boxShadow: '0 2px 8px rgba(0,0,0,.08)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 16,
  border: '1px solid #ccc',
  borderRadius: 6,
  direction: 'ltr',
  boxSizing: 'border-box',
};

const btnStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 0',
  background: '#1565c0',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 16,
  cursor: 'pointer',
  marginTop: 16,
};

const errStyle: React.CSSProperties = {
  color: '#c62828',
  fontSize: 13,
  marginTop: 8,
};

export function LoginPage() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const nav = useNavigate();

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.requestOtp(phone);
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.verifyOtp(phone, otp);
      nav('/verification');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'رمز غير صحيح');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ marginTop: 0, marginBottom: 24 }}>تسجيل الدخول — الإدارة</h2>

      {step === 'phone' ? (
        <form onSubmit={handleRequestOtp}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>رقم الهاتف</label>
          <input
            style={inputStyle}
            type="tel"
            placeholder="+9647xxxxxxxxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          {error && <p style={errStyle}>{error}</p>}
          <button style={btnStyle} type="submit" disabled={loading}>
            {loading ? 'جارٍ الإرسال…' : 'إرسال الرمز'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify}>
          <p style={{ marginTop: 0, color: '#555', fontSize: 14 }}>
            أُرسل رمز إلى <strong style={{ direction: 'ltr', display: 'inline-block' }}>{phone}</strong>
          </p>
          <OtpInput value={otp} onChange={setOtp} />
          {error && <p style={errStyle}>{error}</p>}
          <button style={btnStyle} type="submit" disabled={loading || otp.replace(/\s/g, '').length < 6}>
            {loading ? 'جارٍ التحقق…' : 'تحقق'}
          </button>
          <button
            type="button"
            onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
            style={{ ...btnStyle, background: '#757575', marginTop: 8 }}
          >
            تغيير الرقم
          </button>
        </form>
      )}
    </div>
  );
}
