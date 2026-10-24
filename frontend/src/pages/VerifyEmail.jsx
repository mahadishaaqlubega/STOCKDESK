import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../utils/api';
import { saveSessionNotice } from '../utils/auth';
import { useTheme } from '../components/ThemeProvider';
import logo from '../assets/logo.png';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { resolvedTheme, themeMode } = useTheme();
  const activeTheme = themeMode === 'system' ? resolvedTheme : themeMode;

  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage('This verification link is missing a token. Please use the link from your email.');
      return;
    }

    verifyEmail({ token })
      .then((data) => {
        setStatus('success');
        setMessage(data.message || 'Email verified! You can now sign in.');
        saveSessionNotice('Email verified. You can now sign in.');
        setTimeout(() => navigate('/login', { replace: true }), 3000);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.message || 'This verification link is invalid or has already been used.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="flex min-h-app items-center justify-center px-4 py-8"
      style={{ background: 'var(--bg-auth)' }}
    >
      <div className="app-modal w-full max-w-md overflow-hidden rounded-2xl border p-8 text-center">
        <div className="mb-6 flex justify-center">
          <img src={logo} alt="StockDesk" className="h-12 w-12 object-contain" />
        </div>

        {status === 'loading' && (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[var(--border-default)] border-t-[var(--accent-strong)]" />
            <p className="text-sm text-[var(--text-soft)]">Verifying your email address…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-6 w-6">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Email verified!</h1>
            <p className="mt-2 text-sm text-[var(--text-soft)]">{message}</p>
            <p className="mt-3 text-[13px] text-[var(--text-muted)]">Redirecting you to sign in…</p>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="app-btn-primary mt-5 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold leading-none text-white transition"
            >
              Sign In Now
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-6 w-6">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Verification failed</h1>
            <p className="mt-2 text-sm text-[var(--text-soft)]">{message}</p>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="app-btn-primary mt-5 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold leading-none text-white transition"
            >
              Back to Sign In
            </button>
          </>
        )}
      </div>
    </div>
  );
}
