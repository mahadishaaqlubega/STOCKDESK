import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { loginTwoFactor, twoFactorSetup, twoFactorEnable, twoFactorDisable, twoFactorRecoveryCodes } from '../utils/api';
import { Alert, Field, Modal, Panel, PanelHeader, fieldInput } from './ui';

// The second sign-in step: a 6-digit code from the authenticator app, or a
// recovery code. Calls onSuccess with the normal sign-in response.
export function TwoStepSignIn({ challenge, onSuccess, onCancel }) {
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      onSuccess(await loginTwoFactor({ challenge, code }));
    } catch (err) {
      if (err.code === 'CHALLENGE_EXPIRED') {
        onCancel(err.message);
        return;
      }
      setError(err.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Two-step sign-in</h3>
        <p className="mt-1 text-sm text-[var(--text-soft)]">
          {useRecovery
            ? 'Enter one of the recovery codes you saved when you turned on two-step sign-in. Each works once.'
            : 'Open your authenticator app and enter the 6-digit code for StockDesk.'}
        </p>
      </div>
      <input
        autoFocus
        required
        value={code}
        onChange={(e) => setCode(useRecovery ? e.target.value : e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
        inputMode={useRecovery ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        aria-label={useRecovery ? 'Recovery code' : '6-digit code'}
        placeholder={useRecovery ? 'xxxxx-xxxxx' : '123456'}
        className={`${fieldInput} num text-center text-xl tracking-[0.3em]`}
      />
      {error ? <p className="app-alert-danger rounded-lg px-3 py-2 text-sm" role="alert">{error}</p> : null}
      <button type="submit" disabled={busy || (!useRecovery && code.length !== 6)} className="app-btn-primary w-full rounded-lg px-4 py-3 text-sm disabled:opacity-60">
        {busy ? 'Checking…' : 'Sign in'}
      </button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={() => { setUseRecovery((v) => !v); setCode(''); setError(''); }} className="font-medium text-[var(--accent)] hover:underline">
          {useRecovery ? 'Use the app code instead' : 'Lost your phone? Use a recovery code'}
        </button>
        <button type="button" onClick={() => onCancel('')} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">Back</button>
      </div>
    </form>
  );
}

function RecoveryCodes({ codes, onDone }) {
  const text = codes.join('\n');
  const copy = () => navigator.clipboard?.writeText(text).catch(() => {});
  const download = () => {
    const url = URL.createObjectURL(new Blob([`StockDesk recovery codes\nEach code works once.\n\n${text}\n`], { type: 'text/plain' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: 'stockdesk-recovery-codes.txt' });
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-4">
      <Alert tone="warning">Save these codes somewhere safe now, such as a notebook you keep at home. If you lose your phone, each code lets you sign in once. They will not be shown again.</Alert>
      <ul className="num grid grid-cols-2 gap-2 rounded-lg bg-[var(--surface-secondary)] p-4 text-center font-mono text-sm text-[var(--text-primary)]">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex gap-2">
        <button type="button" onClick={copy} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2 text-sm font-medium">Copy</button>
        <button type="button" onClick={download} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2 text-sm font-medium">Download</button>
        <button type="button" onClick={onDone} className="app-btn-primary flex-1 rounded-lg px-4 py-2 text-sm">I saved them</button>
      </div>
    </div>
  );
}

// My account → Security: turn two-step sign-in on or off.
export function TwoStepPanel({ profile, onChanged }) {
  const enabled = Boolean(profile?.twoFactorEnabled);
  const [mode, setMode] = useState(null); // 'setup' | 'disable' | 'codes'
  const [setup, setSetup] = useState(null);
  const [qr, setQr] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!setup?.otpauthUrl) return;
    QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 220, color: { dark: '#111814', light: '#ffffff' } }).then(setQr).catch(() => setQr(''));
  }, [setup]);

  const close = () => {
    setMode(null);
    setSetup(null);
    setQr('');
    setPassword('');
    setCode('');
    setError('');
  };

  const start = async () => {
    setError('');
    try {
      setSetup(await twoFactorSetup());
      setMode('setup');
    } catch (err) {
      setError(err.message);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'setup') {
        const res = await twoFactorEnable({ password, code });
        close();
        setCodes(res.recoveryCodes);
      } else if (mode === 'codes') {
        const res = await twoFactorRecoveryCodes({ password, code });
        close();
        setCodes(res.recoveryCodes);
      } else {
        await twoFactorDisable({ password, code });
        close();
      }
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="mt-4">
      <PanelHeader
        title="Two-step sign-in"
        description={enabled
          ? `On. Signing in needs your password and a code from your phone.${profile.recoveryCodesLeft != null ? ` ${profile.recoveryCodesLeft} recovery code${profile.recoveryCodesLeft === 1 ? '' : 's'} left.` : ''}`
          : 'Off. Turn it on so a stolen password alone cannot open your account. You need an authenticator app such as Google Authenticator or Microsoft Authenticator.'}
        actions={enabled ? (
          <>
            <button type="button" onClick={() => setMode('codes')} className="app-btn-secondary rounded-lg px-4 py-2 text-sm">New recovery codes</button>
            <button type="button" onClick={() => setMode('disable')} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)]">Turn off</button>
          </>
        ) : (
          <button type="button" onClick={start} className="app-btn-primary rounded-lg px-4 py-2 text-sm">Turn on</button>
        )}
      />
      {error && !mode ? <div className="px-5 py-3"><Alert tone="danger">{error}</Alert></div> : null}

      {mode ? (
        <Modal
          title={mode === 'setup' ? 'Turn on two-step sign-in' : mode === 'codes' ? 'New recovery codes' : 'Turn off two-step sign-in'}
          subtitle={mode === 'setup' ? 'Takes about a minute.' : 'Confirm it is you.'}
          onClose={close}
          size="sm"
        >
          <form onSubmit={submit} className="space-y-4">
            {mode === 'setup' ? (
              <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--text-secondary)]">
                <li>Install <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong> from the Play Store or App Store.</li>
                <li>
                  In the app, tap <strong>+</strong> and scan this code.
                  {qr ? <img src={qr} alt="QR code for your authenticator app" width="180" height="180" className="mx-auto mt-3 rounded-lg border border-[var(--border-default)] bg-white p-1" /> : null}
                  <span className="mt-2 block text-xs">Can't scan? Choose "Enter a setup key" and type: <code className="num break-all rounded bg-[var(--surface-secondary)] px-1.5 py-0.5 text-[var(--text-primary)]">{setup?.secret?.match(/.{1,4}/g)?.join(' ')}</code></span>
                </li>
                <li>Enter the 6-digit code the app shows, and your password.</li>
              </ol>
            ) : null}
            <Field label={mode === 'setup' ? '6-digit code' : 'Code from the app (or a recovery code)'}>
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode={mode === 'setup' ? 'numeric' : 'text'}
                autoComplete="one-time-code"
                className={`${fieldInput} num tracking-[0.2em]`}
                placeholder="123456"
              />
            </Field>
            <Field label="Your password">
              <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={fieldInput} />
            </Field>
            {error ? <p className="app-alert-danger rounded-lg px-3 py-2 text-sm" role="alert">{error}</p> : null}
            <button type="submit" disabled={busy} className={`${mode === 'disable' ? 'bg-[var(--danger)] text-white' : 'app-btn-primary'} w-full rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-60`}>
              {busy ? 'Checking…' : mode === 'setup' ? 'Turn on' : mode === 'codes' ? 'Make new codes' : 'Turn off'}
            </button>
          </form>
        </Modal>
      ) : null}

      {codes ? (
        <Modal title="Your recovery codes" onClose={() => setCodes(null)} size="sm">
          <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />
        </Modal>
      ) : null}
    </Panel>
  );
}
