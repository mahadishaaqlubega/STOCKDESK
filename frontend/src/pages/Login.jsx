import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, signup, forgotPassword, resendVerification } from '../utils/api';
import { consumeSessionNotice, saveSession } from '../utils/auth';
import { useTheme } from '../components/ThemeProvider';
import logo from '../assets/logo.png';

const featureHighlights = [
  {
    title: 'Sell in seconds',
    description: 'Tap or scan items, take Cash, Mobile Money or card, and print a clean receipt.',
    Icon: InventoryIcon,
  },
  {
    title: 'Credit you can track',
    description: 'Sell on credit with limits and due dates, and see exactly who owes you.',
    Icon: LightningIcon,
  },
  {
    title: 'Stock that warns you',
    description: 'Know what is running low or out before customers ask. Works on phone and PC.',
    Icon: ShieldIcon,
  },
];

const brandStats = [
  { value: 'POS', label: 'Sales ready' },
  { value: 'Live', label: 'Stock status' },
  { value: '24/7', label: 'Business view' },
];

function InventoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="m3 7 9-4 9 4-9 4-9-4Z" />
      <path d="m3 7 9 4 9-4" />
      <path d="M12 11v10" />
      <path d="m3 17 9 4 9-4" />
    </svg>
  );
}

function LightningIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M12 3 5 6v6c0 5 3.4 7.9 7 9 3.6-1.1 7-4 7-9V6l-7-3Z" />
      <path d="m9.5 12 1.7 1.7 3.3-3.7" />
    </svg>
  );
}

function ShopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M3 21h18" />
      <path d="M5 21V8l7-4 7 4v13" />
      <path d="M9 10h6" />
      <path d="M9 14h6" />
      <path d="M10 21v-3h4v3" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <path d="M12 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8Z" />
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

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M14.5 8a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7Z" />
      <path d="M11 12H4" />
      <path d="M7 12v3" />
      <path d="M9 12v2" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 10 7 10-7" />
    </svg>
  );
}

function AuthField({ label, type = 'text', value, onChange, placeholder, autoComplete, Icon }) {
  const [showPw, setShowPw] = useState(false);
  const inputType = type === 'password' ? (showPw ? 'text' : 'password') : type;
  return (
    <div>
      <label className="block text-[13px] font-medium text-[var(--text-secondary)]">{label}</label>
      <div className="relative mt-2">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[var(--text-muted)]">
          <Icon />
        </div>
        <input
          type={inputType}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={`app-input w-full rounded-xl border py-2.5 pl-12 text-sm shadow-sm ${type === 'password' ? 'pr-11' : 'pr-4'}`}
        />
        {type === 'password' && (
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition"
            aria-label={showPw ? 'Hide password' : 'Show password'}
          >
            {showPw ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Login() {
  const [mode, setMode] = useState('login');
  const { resolvedTheme, themeMode, setThemeMode } = useTheme();
  const activeTheme = themeMode === 'system' ? resolvedTheme : themeMode;
  const [loginForm, setLoginForm] = useState({ shopName: '', username: '', password: '' });
  const [signupForm, setSignupForm] = useState({
    shopName: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
  });
  const [pendingEmail, setPendingEmail] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const panelCopy =
    mode === 'login'
      ? {
          eyebrow: 'Shop Sign In',
          title: 'Welcome back',
          description: 'Sign in to your shop to start selling.',
          note: 'Enter your shop name exactly as you registered it.',
          action: loading ? 'Signing in…' : 'Sign in',
        }
      : mode === 'signup'
      ? {
          eyebrow: 'Create Workspace',
          title: 'Launch a new shop',
          description: 'Set up a new StockDesk workspace. A verification link will be sent to the admin email address.',
          note: 'Check your inbox and click the link to activate your account before signing in.',
          action: loading ? 'Creating shop...' : 'Create Shop',
        }
      : mode === 'forgot'
      ? {
          eyebrow: 'Password Reset',
          title: 'Forgot your password?',
          description: "Enter the admin email address and we'll send you a reset link.",
          note: '',
          action: loading ? 'Sending...' : 'Send Reset Link',
        }
      : {
          eyebrow: 'Check your inbox',
          title: 'Verify your email',
          description: '',
          note: '',
          action: '',
        };

  useEffect(() => {
    const notice = consumeSessionNotice();

    if (notice) {
      setSuccess(notice);
    }
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const data = await login(loginForm);
      saveSession(data.token, data.user);
      navigate('/app');
    } catch (err) {
      if (err.needsVerification) {
        setPendingEmail(err.maskedEmail || '');
        setMode('verify-pending');
        setLoading(false);
        return;
      }
      setError(err.message || 'Login failed. Please try again.');
      setLoading(false);
    }
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (signupForm.password !== signupForm.confirmPassword) {
        throw new Error('Passwords do not match');
      }
      const strongPw = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
      if (!strongPw.test(signupForm.password)) {
        throw new Error('Password must be at least 8 characters and include letters, numbers, and a special character.');
      }
      const data = await signup(signupForm);
      setPendingEmail(data.email || '');
      setSignupForm({ shopName: '', email: '', username: '', password: '', confirmPassword: '' });
      setMode('verify-pending');
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Sign up failed. Please try again.');
      setLoading(false);
    }
  };

  const handleForgotPassword = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await forgotPassword({ email: forgotEmail });
      setSuccess('If that email is registered, a reset link has been sent to your inbox.');
      setForgotEmail('');
    } catch (err) {
      setError(err.message || 'Request failed. Please try again.');
    }
    setLoading(false);
  };

  const handleResendVerification = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await resendVerification({ email: pendingEmail });
      setSuccess('A new verification link has been sent.');
    } catch (err) {
      setError(err.message || 'Failed to resend. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="relative min-h-dvh overflow-x-hidden px-3 py-2 sm:px-4 sm:py-3 lg:px-5 lg:py-2.5" style={{ background: 'var(--bg-auth)' }}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-8 h-64 w-64 rounded-full bg-[var(--accent)]/15 blur-3xl" />
        <div className="absolute right-0 top-1/4 h-72 w-72 rounded-full bg-[var(--success)]/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-56 w-56 rounded-full bg-[var(--accent-hover)]/10 blur-3xl" />
      </div>

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

      <div className="app-modal relative mx-auto grid w-full max-w-5xl overflow-visible rounded-2xl border backdrop-blur lg:min-h-[calc(100dvh-6rem)] lg:grid-cols-[0.98fr_minmax(0,1.02fr)]">
        <section className="relative hidden overflow-hidden lg:block lg:px-7 lg:py-6 xl:px-8 xl:py-7" style={{ background: 'var(--sidebar-bg)' }}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(30,167,189,0.24),transparent_34%)]" />
          <div className="absolute right-8 top-8 h-24 w-24 rounded-full border border-white/10 bg-white/5 blur-2xl" />
          <div className="absolute bottom-10 left-10 h-32 w-32 rounded-full bg-[var(--accent)]/15 blur-3xl" />

          <div className="relative flex h-full flex-col justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/10 p-2.5 shadow-[0_18px_45px_rgba(0,0,0,0.18)] backdrop-blur">
                <img src={logo} alt="StockDesk logo" className="h-15 w-15 object-contain" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">StockDesk</p>
                <p className="mt-0.5 text-base font-semibold tracking-tight text-white xl:text-lg">Point of sale & stock for shops</p>
              </div>
            </div>

            <div className="max-w-xl">
              <h1 className="text-[2.1rem] font-bold leading-tight tracking-tight text-white xl:text-[2.2rem]">
                Run your whole shop from one screen.
              </h1>
              <p className="mt-2.5 max-w-lg text-[14px] leading-6 text-white/70">
                Sales, stock, customers and credit. Clear, fast and built for the way shops in Uganda actually work.
              </p>
            </div>

            <div className="grid gap-2.5 xl:grid-cols-2">
              {featureHighlights.map(({ title, description, Icon }, index) => (
                <div
                  key={title}
                  className={`flex items-start gap-3 rounded-xl border border-white/10 bg-white/6 px-3.5 py-3 backdrop-blur-sm ${
                    index === 2 ? 'xl:col-span-2' : ''
                  }`}
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.95rem] bg-white/10 text-white">
                    <Icon />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="mt-1 text-[12.5px] leading-5 text-white/70">{description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden grid-cols-3 gap-2.5 2xl:grid">
              {brandStats.map((item) => (
                <div key={item.label} className="rounded-xl border border-white/10 bg-white/8 px-3 py-2.5 text-center backdrop-blur-sm">
                  <div className="text-sm font-semibold tracking-tight text-white xl:text-base">{item.value}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.16em] text-white/70">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-5 sm:px-7 sm:py-6 lg:px-7 lg:py-6 xl:px-8 xl:py-7">
          <div className="mx-auto max-w-xl lg:flex lg:h-full lg:flex-col lg:justify-center">
            <div className="mb-5 lg:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-secondary)] p-2.5 shadow-sm">
                  <img src={logo} alt="StockDesk logo" className="h-11 w-11 object-contain" />
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--accent-strong)]">StockDesk</p>
                  <p className="mt-1 text-lg font-semibold tracking-tight text-[var(--text-primary)]">Business workspace</p>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">
                Sign in quickly and keep stock, sales, and team activity in one place.
              </p>
            </div>

            <h2 className="mt-1 text-[1.9rem] font-bold tracking-tight text-[var(--text-primary)] sm:text-[2rem]">{panelCopy.title}</h2>
            {panelCopy.description ? (
              <p className="mt-2 max-w-lg text-sm leading-6 text-[var(--text-soft)] sm:text-[15px]">{panelCopy.description}</p>
            ) : null}

            {mode === 'login' || mode === 'signup' ? (
              <div className="mt-4 grid grid-cols-2 rounded-xl bg-[var(--surface-secondary)] p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                    setSuccess('');
                  }}
                  className={`inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold leading-none transition ${
                    mode === 'login' ? 'app-panel text-[var(--accent-strong)]' : 'text-[var(--text-muted)]'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError('');
                    setSuccess('');
                  }}
                  className={`inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold leading-none transition ${
                    mode === 'signup' ? 'app-panel text-[var(--accent-strong)]' : 'text-[var(--text-muted)]'
                  }`}
                >
                  Create Shop
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent-strong)] hover:underline"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                Back to Sign In
              </button>
            )}

            <div className="app-panel-soft mt-4 rounded-2xl border p-4 sm:p-4.5">
              {mode === 'login' ? (
                <form className="space-y-3.5" onSubmit={handleSubmit}>
                  <AuthField
                    label="Shop Name"
                    value={loginForm.shopName}
                    onChange={(event) => setLoginForm((prev) => ({ ...prev, shopName: event.target.value }))}
                    placeholder="Enter your shop name"
                    autoComplete="organization"
                    Icon={ShopIcon}
                  />

                  <AuthField
                    label="Username or Email"
                    value={loginForm.username}
                    onChange={(event) => setLoginForm((prev) => ({ ...prev, username: event.target.value }))}
                    placeholder="Enter username or email address"
                    autoComplete="username"
                    Icon={UserIcon}
                  />

                  <AuthField
                    label="Password"
                    type="password"
                    value={loginForm.password}
                    onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                    autoComplete="current-password"
                    Icon={LockIcon}
                  />

                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 rounded-xl border border-[var(--border-default)] bg-[var(--surface-primary)] px-4 py-2.5 text-sm leading-5 text-[var(--text-muted)]">
                      {panelCopy.note}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}
                      className="shrink-0 text-sm font-medium text-[var(--accent-strong)] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>

                  {error ? <div className="app-alert-danger rounded-xl px-4 py-2.5 text-sm">{error}</div> : null}
                  {success ? <div className="app-alert-success rounded-xl px-4 py-2.5 text-sm">{success}</div> : null}

                  <button
                    type="submit"
                    disabled={loading}
                    className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold leading-none text-white transition ${
                      loading ? 'cursor-not-allowed bg-gray-400' : 'app-btn-primary'
                    }`}
                  >
                    {panelCopy.action}
                  </button>
                </form>
              ) : mode === 'verify-pending' ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-3 py-2 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-[var(--accent-strong)]">
                      <MailIcon />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Check your inbox</p>
                      {pendingEmail ? (
                        <p className="mt-1 text-sm text-[var(--text-soft)]">
                          We sent a verification link to <span className="font-medium text-[var(--text-primary)]">{pendingEmail}</span>
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-[var(--text-soft)]">We sent a verification link to your email address.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-primary)] px-4 py-3 text-[13px] text-[var(--text-muted)]">
                    Click the link in the email to activate your account, then come back and sign in.
                  </div>

                  {error ? <div className="app-alert-danger rounded-xl px-4 py-2.5 text-sm">{error}</div> : null}
                  {success ? <div className="app-alert-success rounded-xl px-4 py-2.5 text-sm">{success}</div> : null}

                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleResendVerification}
                    className={`inline-flex w-full items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--surface-primary)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)] ${
                      loading ? 'cursor-not-allowed opacity-60' : ''
                    }`}
                  >
                    {loading ? 'Sending...' : 'Resend verification email'}
                  </button>
                </div>
              ) : mode === 'forgot' ? (
                <form className="space-y-3.5" onSubmit={handleForgotPassword}>
                  <AuthField
                    label="Admin Email Address"
                    type="email"
                    value={forgotEmail}
                    onChange={(event) => setForgotEmail(event.target.value)}
                    placeholder="Enter the admin email address"
                    autoComplete="email"
                    Icon={MailIcon}
                  />

                  {error ? <div className="app-alert-danger rounded-xl px-4 py-2.5 text-sm">{error}</div> : null}
                  {success ? <div className="app-alert-success rounded-xl px-4 py-2.5 text-sm">{success}</div> : null}

                  <button
                    type="submit"
                    disabled={loading}
                    className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold leading-none text-white transition ${
                      loading ? 'cursor-not-allowed bg-gray-400' : 'app-btn-primary'
                    }`}
                  >
                    {panelCopy.action}
                  </button>
                </form>
              ) : (
                <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSignup}>
                  <AuthField
                    label="Shop Name"
                    value={signupForm.shopName}
                    onChange={(event) => setSignupForm((prev) => ({ ...prev, shopName: event.target.value }))}
                    placeholder="Choose a shop name"
                    autoComplete="organization"
                    Icon={ShopIcon}
                  />
                  <AuthField
                    label="Admin Email"
                    type="email"
                    value={signupForm.email}
                    onChange={(event) => setSignupForm((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="Admin email address"
                    autoComplete="email"
                    Icon={MailIcon}
                  />
                  <AuthField
                    label="Admin Username"
                    value={signupForm.username}
                    onChange={(event) => setSignupForm((prev) => ({ ...prev, username: event.target.value }))}
                    placeholder="Create an admin username"
                    autoComplete="username"
                    Icon={UserIcon}
                  />
                  <AuthField
                    label="Password"
                    type="password"
                    value={signupForm.password}
                    onChange={(event) => setSignupForm((prev) => ({ ...prev, password: event.target.value }))}
                    autoComplete="new-password"
                    Icon={LockIcon}
                  />
                  <div className="md:col-span-2">
                    <AuthField
                      label="Confirm Password"
                      type="password"
                      value={signupForm.confirmPassword}
                      onChange={(event) => setSignupForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                      autoComplete="new-password"
                      Icon={KeyIcon}
                    />
                  </div>

                  <div className="app-alert-warning md:col-span-2 rounded-xl px-4 py-2.5 text-sm">
                    {panelCopy.note}
                  </div>

                  {error ? <div className="app-alert-danger md:col-span-2 rounded-xl px-4 py-2.5 text-sm">{error}</div> : null}
                  {success ? <div className="app-alert-success md:col-span-2 rounded-xl px-4 py-2.5 text-sm">{success}</div> : null}

                  <button
                    type="submit"
                    disabled={loading}
                    className={`md:col-span-2 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold leading-none text-white transition ${
                      loading ? 'cursor-not-allowed bg-gray-400' : 'app-btn-primary'
                    }`}
                  >
                    {panelCopy.action}
                  </button>
                </form>
              )}
            </div>

          </div>
        </section>
      </div>
    </div>
  );
}
