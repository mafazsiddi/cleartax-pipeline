import React, { useState, useEffect, useRef } from 'react';
import { LayoutGrid, Check, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

export default function LoginScreen() {
  const { login } = useAuth();
  const [step, setStep] = useState('email'); // "email" | "otp"
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const otpRef = useRef(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  useEffect(() => {
    if (step === 'otp') {
      const id = setTimeout(() => otpRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
  }, [step]);

  const requestCode = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setNotice('');
    const trimmed = email.trim();
    if (!trimmed) return setError('Please enter your email address.');

    setLoading(true);
    try {
      const data = await apiFetch('/auth/request-otp', { method: 'POST', body: { email: trimmed } });
      setStep('otp');
      setOtp('');
      setResendIn(30);
      setNotice(
        data.devConsole
          ? 'Email delivery is off — your code is printed in the server console.'
          : `We sent a 6-digit code to ${trimmed}.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setError('');
    const code = otp.trim();
    if (code.length !== 6) return setError('Enter the 6-digit code from your email.');

    setLoading(true);
    try {
      const data = await apiFetch('/auth/verify-otp', { method: 'POST', body: { email: email.trim(), otp: code } });
      login(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid #E6E9F0',
    background: '#FBFBFD',
    color: '#1B2333',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: "'Inter', sans-serif",
    transition: 'all 0.15s ease',
  };
  const focusIn = (e) => {
    e.target.style.borderColor = '#4338CA';
    e.target.style.boxShadow = '0 0 0 3px #EEEDFB';
    e.target.style.background = '#ffffff';
  };
  const blurOut = (e) => {
    e.target.style.borderColor = '#E6E9F0';
    e.target.style.boxShadow = 'none';
    e.target.style.background = '#FBFBFD';
  };
  const labelStyle = {
    display: 'block',
    fontSize: '11.5px',
    fontWeight: '600',
    color: '#586074',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontFamily: "'Inter', sans-serif",
  };
  const buttonStyle = {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    background: '#4338CA',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    cursor: loading ? 'not-allowed' : 'pointer',
    transition: 'all 0.14s ease',
    opacity: loading ? 0.7 : 1,
    fontFamily: "'Inter', sans-serif",
    boxShadow: '0 1px 2px rgba(20,28,48,.05)',
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #F5F6F9 0%, #EEF0F5 100%)',
      fontFamily: "'Space Grotesk', system-ui, -apple-system, sans-serif", padding: '20px',
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(16px)', borderRadius: '20px',
        border: '1px solid #E6E9F0', width: '100%', maxWidth: '400px', padding: '40px 32px',
        boxShadow: '0 12px 40px rgba(20, 28, 48, 0.12)', textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '54px', height: '54px',
          borderRadius: '14px', background: '#4338CA', marginBottom: '20px', color: 'white',
          boxShadow: 'inset 0 -2px 4px rgba(0,0,0,.15)',
        }}>
          <LayoutGrid size={24} strokeWidth={2.4} />
        </div>
        <h2 style={{
          fontSize: '24px', fontWeight: '700', color: '#1B2333', margin: '0 0 6px 0',
          letterSpacing: '-0.5px', fontFamily: "'Space Grotesk', sans-serif",
        }}>
          Mira
        </h2>
        <p style={{
          fontSize: '13.5px', color: '#586074', margin: '0 0 28px 0', lineHeight: '1.5',
          fontWeight: '500', fontFamily: "'Inter', sans-serif",
        }}>
          {step === 'email' ? 'Sign in to your projects' : 'Check your inbox for the code'}
        </p>

        {notice && !error && (
          <div style={{
            background: '#EEF6FF', border: '1px solid #CFE3FB', borderRadius: '10px', padding: '12px 14px',
            color: '#1D4ED8', fontSize: '12.5px', textAlign: 'left', marginBottom: '20px',
            display: 'flex', alignItems: 'flex-start', gap: '8px', fontWeight: '500', fontFamily: "'Inter', sans-serif",
          }}>
            <Check size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{notice}</span>
          </div>
        )}

        {error && (
          <div style={{
            background: '#FDECED', border: '1px solid #F7C9CB', borderRadius: '10px', padding: '12px 14px',
            color: '#E5484D', fontSize: '12.5px', textAlign: 'left', marginBottom: '20px',
            display: 'flex', alignItems: 'flex-start', gap: '8px', fontWeight: '500', fontFamily: "'Inter', sans-serif",
          }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={requestCode}>
            <div style={{ textAlign: 'left', marginBottom: '20px' }}>
              <label style={labelStyle}>Email Address</label>
              <input
                type="email"
                placeholder="name@clear.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={inputStyle}
                onFocus={focusIn}
                onBlur={blurOut}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={buttonStyle}
              onMouseOver={(e) => { if (!loading) e.target.style.background = '#5B50E6'; }}
              onMouseOut={(e) => { if (!loading) e.target.style.background = '#4338CA'; }}
            >
              {loading ? 'Sending code...' : 'Send sign-in code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode}>
            <div style={{ textAlign: 'left', marginBottom: '20px' }}>
              <label style={labelStyle}>6-Digit Code</label>
              <input
                ref={otpRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                  if (error) setError('');
                }}
                required
                style={{ ...inputStyle, textAlign: 'center', fontSize: '22px', fontWeight: '600', letterSpacing: '8px', padding: '12px 14px' }}
                onFocus={focusIn}
                onBlur={blurOut}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={buttonStyle}
              onMouseOver={(e) => { if (!loading) e.target.style.background = '#5B50E6'; }}
              onMouseOut={(e) => { if (!loading) e.target.style.background = '#4338CA'; }}
            >
              {loading ? 'Verifying...' : 'Access Mira'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', fontSize: '12.5px', fontFamily: "'Inter', sans-serif" }}>
              <button
                type="button"
                onClick={() => { setStep('email'); setError(''); setNotice(''); setOtp(''); }}
                style={{ background: 'none', border: 'none', padding: 0, color: '#586074', cursor: 'pointer', fontWeight: '500', fontSize: '12.5px' }}
              >
                ← Use a different email
              </button>
              <button
                type="button"
                disabled={loading || resendIn > 0}
                onClick={() => requestCode()}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: resendIn > 0 ? '#A3AAB8' : '#4338CA',
                  cursor: resendIn > 0 ? 'default' : 'pointer', fontWeight: '600', fontSize: '12.5px',
                }}
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
