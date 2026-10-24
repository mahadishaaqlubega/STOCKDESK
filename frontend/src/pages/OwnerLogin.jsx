import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { login } from '../utils/api';
import { consumeSessionNotice, getToken, saveSession } from '../utils/auth';
import { useTheme } from '../components/ThemeProvider';
import logo from '../assets/logo.png';

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="m1 1 22 22" />
      <path d="M10.73 10.73a3 3 0 0 0 4.1 4.1" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function BarChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M4 19h16" />
      <path d="M7 16V9" />
      <path d="M12 16V5" />
      <path d="M17 16v-3" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

const features = [
  { title: 'Platform overview', desc: 'Monitor every shop, user, and product across the network.', Icon: GlobeIcon },
  { title: 'Live activity', desc: 'Track signups, logins, and business events in real time.', Icon: BarChartIcon },
  { title: 'Access control', desc: 'Manage shop tenants and platform-level settings.', Icon: ShieldIcon },
];

export default function OwnerLogin() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const navigate = useNavigate();
  const { resolvedTheme, themeMode, setThemeMode } = useTheme();
  const activeTheme = themeMode === 'system' ? resolvedTheme : themeMode;

  useEffect(() => {
    const nextNotice = consumeSessionNotice();
    if (nextNotice) setNotice(nextNotice);
  }, []);

  if (getToken()) {
    return <Navigate to="/app/owner" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login({ shopName: '', username: form.username, password: form.password });
      saveSession(data.token, data.user);
      navigate('/app/owner');
    } catch (err) {
      setError(err.message || 'Platform sign in failed.');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-app overflow-x-hidden px-3 py-2 sm:px-4 sm:py-3 lg:px-5 lg:py-2.5" style={{ background: 'var(--bg-auth)' }}>
      {/* Background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-8 h-64 w-64 rounded-full bg-[var(--accent)]/15 blur-3xl" />
        <div className="absolute right-0 top-1/4 h-72 w-72 rounded-full bg-[var(--success)]/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-56 w-56 rounded-full bg-[var(--accent-hover)]/10 blur-3xl" />
      </div>

      {/* Theme toggle */}
      <div className="relative mx-auto flex max-w-5xl justify-end">
        <button
          type="button"
          onClick={() => setThemeMode(activeTheme === 'dark' ? 'light' : 'dark')}
          title={activeTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
          className="mb-2 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-primary)] text-[var(--text-muted)] shadow-sm transition hover:text-[var(--text-primary)]"
        >
          {activeTheme === 'dark' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2.5" /><path d="M12 19.5V22" />
              <path d="M4.9 4.9 6.7 6.7" /><path d="M17.3 17.3 19.1 19.1" />
              <path d="M2 12h2.5" /><path d="M19.5 12H22" />
              <path d="m4.9 19.1 1.8-1.8" /><path d="m17.3 6.7 1.8-1.8" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
            </svg>
          )}
        </button>
      </div>

      <div className="app-modal relative mx-auto grid w-full max-w-5xl overflow-visible rounded-2xl border backdrop-blur lg:min-h-[calc(100dvh/var(--app-zoom,1)_-_6rem)] lg:grid-cols-[0.98fr_minmax(0,1.02fr)]">
        {/* Left panel - branding */}
        <section className="relative hidden overflow-hidden lg:block lg:px-7 lg:py-6 xl:px-8 xl:py-7" style={{ background: 'var(--sidebar-bg)' }}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(13,148,136,0.24),transparent_34%)]" />
          <div className="absolute right-8 top-8 h-24 w-24 rounded-full border border-white/10 bg-white/5 blur-2xl" />
          <div className="absolute bottom-10 left-10 h-32 w-32 rounded-full bg-[var(--accent)]/15 blur-3xl" />

          <div className="relative flex h-full flex-col justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src={logo} alt="StockDesk logo" className="h-20 w-20 object-contain" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">StockDesk</p>
                <p className="mt-0.5 text-base font-semibold tracking-tight text-white xl:text-lg">Platform Console</p>
              </div>
            </div>

            <div className="max-w-xl">
              <h1 className="text-[2.1rem] font-bold leading-tight tracking-tight text-white xl:text-[2.2rem]">
                Manage the entire network from one owner dashboard.
              </h1>
              <p className="mt-2.5 max-w-lg text-[14px] leading-6 text-white/70">
                Monitor shop signups, track tenant activity, and oversee platform health, all in real time.
              </p>
            </div>

            <div className="space-y-2.5">
              {features.map(({ title, desc, Icon }) => (
                <div key={title} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/6 px-3.5 py-3 backdrop-blur-sm">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.95rem] bg-white/10 text-white">
                    <Icon />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="mt-1 text-[12.5px] leading-5 text-white/70">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden grid-cols-3 gap-2.5 2xl:grid">
              {[
                { value: 'Shops', label: 'All tenants' },
                { value: 'Live', label: 'Real-time' },
                { value: '24/7', label: 'Monitoring' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-white/10 bg-white/8 px-3 py-2.5 text-center backdrop-blur-sm">
                  <div className="text-sm font-semibold tracking-tight text-white xl:text-base">{item.value}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.16em] text-white/70">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right panel - login form */}
        <section className="px-5 py-5 sm:px-7 sm:py-6 lg:px-7 lg:py-6 xl:px-8 xl:py-7">
          <div className="mx-auto max-w-xl lg:flex lg:h-full lg:flex-col lg:justify-center">
            {/* Mobile logo */}
            <div className="mb-5 lg:hidden">
              <div className="flex items-center gap-3">
                <img src={logo} alt="StockDesk logo" className="h-12 w-12 object-contain" />
                <div>
                  <p className="text-xs font-medium text-[var(--accent-strong)]">StockDesk</p>
                  <p className="mt-1 text-lg font-semibold tracking-tight text-[var(--text-primary)]">Platform Console</p>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">
                Sign in to manage all shops and monitor platform activity.
              </p>
            </div>

            <h2 className="mt-1 text-[1.9rem] font-bold tracking-tight text-[var(--text-primary)] sm:text-[2rem]">Welcome back, Owner</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-[var(--text-soft)] sm:text-[15px]">
              Sign in to the platform console to monitor tenant signups, shop activity, and live business movement across the network.
            </p>

            <div className="app-panel-soft mt-6 rounded-2xl border p-5 sm:p-6">
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="block text-[13px] font-medium text-[var(--text-secondary)]">Username</label>
                  <div className="relative mt-2">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[var(--text-muted)]">
                      <UserIcon />
                    </div>
                    <input
                      type="text"
                      value={form.username}
                      onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
                      className="app-input w-full rounded-xl border py-2.5 pl-12 pr-4 text-sm shadow-sm"
                      placeholder="Enter your username"
                      autoComplete="username"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[var(--text-secondary)]">Password</label>
                  <div className="relative mt-2">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[var(--text-muted)]">
                      <LockIcon />
                    </div>
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={form.password}
                      onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                      className="app-input w-full rounded-xl border py-2.5 pl-12 pr-11 text-sm shadow-sm"
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-primary)] px-4 py-2.5 text-sm text-[var(--text-muted)]">
                  This route is for platform ownership only. Shop admins and staff should use the normal login page.
                </div>

                {notice ? <div className="app-alert-success rounded-xl px-4 py-2.5 text-sm">{notice}</div> : null}
                {error ? <div className="app-alert-danger rounded-xl px-4 py-2.5 text-sm">{error}</div> : null}

                <button
                  type="submit"
                  disabled={loading}
                  className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold leading-none text-white transition ${
                    loading ? 'cursor-not-allowed bg-gray-400' : 'app-btn-primary'
                  }`}
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </div>

            <p className="mt-5 text-center text-xs text-[var(--text-muted)]">
              Need shop access instead?{' '}
              <a href="/login" className="font-medium text-[var(--accent-strong)] hover:underline">
                Go to shop login
              </a>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
