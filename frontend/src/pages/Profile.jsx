import { useEffect, useRef, useState } from 'react';
import { fetchProfile, updateProfile, resendVerification, changePassword, closeAccount, signOutEverywhere } from '../utils/api';
import { getToken, updateToken, logout } from '../utils/auth';
import { Link } from 'react-router-dom';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { Alert, Badge, Field, Modal, Panel, PanelHeader, fieldInput } from '../components/ui';

function resizeImage(file, maxSize = 512) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.round(image.width * scale);
        const height = Math.round(image.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      image.onerror = () => reject(new Error('Could not read the selected image'));
      image.src = event.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read the selected file'));
    reader.readAsDataURL(file);
  });
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}









export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const fileInputRef = useRef(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState('');
  const [pwMessageType, setPwMessageType] = useState('success');
  const [showPw, setShowPw] = useState(false);

  const [closePw, setClosePw] = useState('');
  const [closeConfirmText, setCloseConfirmText] = useState('');
  const [closing, setClosing] = useState(false);
  const [closeMessage, setCloseMessage] = useState('');
  const [closeStep, setCloseStep] = useState('confirm');
  const [activeTab, setActiveTab] = useState('account');

  useBodyScrollLock(showAvatarModal);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await fetchProfile();
      setProfile(data);
      setName(data.name || '');
      setEmail(data.email || '');
      setAvatarUrl(data.avatarUrl || null);
      setAvatarPreview(data.avatarUrl || null);
    } catch (error) {
      setMessage(error.message);
      setMessageType('error');
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (!file.type.startsWith('image/')) {
        setMessage('Please choose an image file.');
        setMessageType('error');
        return;
      }
      const dataUrl = await resizeImage(file);
      setAvatarUrl(dataUrl);
      setAvatarPreview(dataUrl);
      setAvatarChanged(true);
      setShowAvatarModal(true);
      setMessage('');
    } catch (error) {
      setMessage(error.message);
      setMessageType('error');
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarUrl(null);
    setAvatarPreview(null);
    setAvatarChanged(true);
    setShowAvatarModal(false);
    setMessage('');
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const body = { name };
      if (email !== (profile?.email || '')) {
        body.email = email;
      }
      if (avatarChanged) {
        body.avatarUrl = avatarUrl;
      }
      const data = await updateProfile(body);
      setProfile(data);
      setAvatarChanged(false);
      updateToken(getToken(), {
        ...(JSON.parse(localStorage.getItem('stockdesk_user') || 'null') || {}),
        name: data.name,
        avatarUrl: data.avatarUrl,
        isVerified: data.isVerified,
      });
      if (data.verificationPending) {
        setMessage(
          data.verificationEmailSent
            ? 'Email updated. A verification link has been sent to your new address. Click it to verify your email.'
            : data.message || 'Email updated but the verification link could not be sent. You can resend it below.'
        );
        setMessageType('success');
      } else {
        setMessage('Profile updated successfully.');
        setMessageType('success');
      }
    } catch (error) {
      setMessage(error.message);
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    setMessage('');
    try {
      await resendVerification({ email });
      setMessage('A new verification link has been sent to your email address.');
      setMessageType('success');
    } catch (error) {
      setMessage(error.message);
      setMessageType('error');
    } finally {
      setResending(false);
    }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    setPwSaving(true);
    setPwMessage('');
    try {
      const strongPw = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
      if (newPassword !== confirmPassword) {
        throw new Error('Passwords do not match.');
      }
      if (!strongPw.test(newPassword)) {
        throw new Error('Password must be at least 8 characters and include letters, numbers, and a special character.');
      }
      const data = await changePassword({ currentPassword, newPassword, confirmPassword });
      // The change ends every other session; keep this one on the new token.
      if (data.token) updateToken(data.token);
      setPwMessage(data.message || 'Password updated successfully.');
      setPwMessageType('success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setPwMessage(error.message);
      setPwMessageType('error');
    } finally {
      setPwSaving(false);
    }
  };

  const handleSignOutEverywhere = async () => {
    if (!window.confirm('Sign out on every device, including this one?')) return;
    try {
      await signOutEverywhere();
      logout({ message: 'You were signed out on every device.' });
    } catch (error) {
      setPwMessage(error.message);
      setPwMessageType('error');
    }
  };

  const handleCloseAccount = async (event) => {
    event.preventDefault();
    setClosing(true);
    setCloseMessage('');
    try {
      if (closeConfirmText.trim() !== 'DELETE') {
        throw new Error('Type DELETE to confirm you want to close this account.');
      }
      if (!closePw) {
        throw new Error('Enter your password to verify.');
      }
      await closeAccount({ currentPassword: closePw, confirm: true });
      setCloseMessage('Your account has been closed.');
      logout({ message: 'Your account has been closed. Thank you for using StockDesk.' });
    } catch (error) {
      setCloseMessage(error.message);
    } finally {
      setClosing(false);
    }
  };

  const handleStartClose = () => {
    setCloseStep('verify');
    setCloseMessage('');
  };

  const handleCancelClose = () => {
    setCloseStep('confirm');
    setClosePw('');
    setCloseConfirmText('');
    setCloseMessage('');
  };

  const initials = String(profile?.name || 'S').slice(0, 1).toUpperCase();
  const roleLabel = profile?.role === 'SuperAdmin' ? 'Platform administrator' : profile?.displayRole || profile?.role || 'User';
  const memberSince = profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const isSuperAdmin = profile?.role === 'SuperAdmin';
  const pwInputType = showPw ? 'text' : 'password';
  const stats = profile?.stats;

  const sections = [
    { key: 'account', label: 'Profile' },
    { key: 'security', label: 'Password' },
    { key: 'shop', label: isSuperAdmin ? 'Access' : 'Shop' },
    { key: 'danger', label: 'Close account' },
  ];

  const shopFields = isSuperAdmin
    ? [['Access', 'All registered shops'], ['Username', profile?.username || '-']]
    : [
        ['Shop name', profile?.shopDetails?.shopName || profile?.shop?.name || '-'],
        ['Phone', profile?.shopDetails?.phone || '-'],
        ['Address', profile?.shopDetails?.address || '-'],
        ['Currency', profile?.shopDetails?.currency || '-'],
        ['Shop ID', profile?.shop?.slug || '-'],
      ];

  return (
    <div className="space-y-5">
      {/* Identity */}
      <Panel className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="group relative h-16 w-16 shrink-0 rounded-full" aria-label="Change profile photo">
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="h-16 w-16 rounded-full object-cover ring-1 ring-[var(--border-strong)]" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)] text-2xl font-semibold text-[var(--accent-strong)]">{initials}</span>
            )}
            <span className="app-touch-reveal absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100"><CameraIcon /></span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">{profile?.name || 'Loading…'}</h2>
              <Badge tone="accent">{roleLabel}</Badge>
              {profile?.email && profile?.isVerified ? <Badge tone="success">Email verified</Badge> : email ? <Badge tone="warning">Email not verified</Badge> : null}
            </div>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              {isSuperAdmin ? 'Platform console' : profile?.shop?.name || 'No shop'}{memberSince ? ` · member since ${memberSince}` : ''}
            </p>
          </div>
          {stats ? (
            <dl className="flex gap-6 text-sm sm:pr-2">
              {[['Products', stats.products], ['Sales', stats.sales], ['Customers', stats.customers]].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
                  <dd className="num text-lg font-semibold text-[var(--text-primary)]">{Number(value || 0).toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </Panel>

      {message ? <Alert tone={messageType === 'error' ? 'danger' : 'success'}>{message}</Alert> : null}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:sticky lg:top-20 lg:flex-col" aria-label="Account sections">
          {sections.map((section) => (
            <button
              key={section.key}
              type="button"
              onClick={() => setActiveTab(section.key)}
              aria-current={activeTab === section.key ? 'page' : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                activeTab === section.key
                  ? `bg-[var(--surface-primary)] shadow-sm ring-1 ring-[var(--border-default)] ${section.key === 'danger' ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`
                  : `${section.key === 'danger' ? 'text-[var(--danger)] opacity-80' : 'text-[var(--text-muted)]'} hover:text-[var(--text-primary)]`
              }`}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-5">
          {activeTab === 'account' ? (
            <Panel as="form" onSubmit={handleSave}>
              <PanelHeader title="Profile" description="Your name and the email used for sign-in help and password resets." />
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <Field label="Full name">
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={fieldInput} required />
                </Field>
                <Field label="Username" hint="Usernames can't be changed.">
                  <input type="text" value={profile?.username || ''} className={`${fieldInput} cursor-not-allowed font-mono opacity-70`} disabled />
                </Field>
                <Field label="Email" className="sm:col-span-2" hint={!profile?.isVerified && email ? 'Check your inbox for the verification link.' : undefined}>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldInput} placeholder="you@example.com" />
                </Field>
                {!(profile?.email && profile?.isVerified) && email ? (
                  <div className="sm:col-span-2">
                    <button type="button" onClick={handleResend} disabled={resending} className="text-sm font-medium text-[var(--accent)] hover:underline disabled:opacity-50">
                      {resending ? 'Sending…' : 'Resend verification email'}
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-[var(--border-default)] px-5 py-4">
                {avatarPreview ? (
                  <button type="button" onClick={handleRemoveAvatar} className="text-sm text-[var(--text-muted)] hover:text-[var(--danger)]">Remove photo</button>
                ) : <span />}
                <button type="submit" disabled={saving} className="app-btn-primary rounded-lg px-5 py-2.5 text-sm disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
              </div>
            </Panel>
          ) : null}

          {activeTab === 'security' ? (
            <Panel as="form" onSubmit={handleChangePassword}>
              <PanelHeader title="Change password" description="At least 8 characters with a letter, a number and a symbol." />
              <div className="max-w-md space-y-4 p-5">
                <Field label="Current password">
                  <input type={pwInputType} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={fieldInput} autoComplete="current-password" required />
                </Field>
                <Field label="New password">
                  <input type={pwInputType} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={fieldInput} autoComplete="new-password" required />
                </Field>
                <Field label="Confirm new password">
                  <input type={pwInputType} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={fieldInput} autoComplete="new-password" required />
                </Field>
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <input type="checkbox" checked={showPw} onChange={() => setShowPw((v) => !v)} /> Show passwords
                </label>
                {pwMessage ? <Alert tone={pwMessageType === 'error' ? 'danger' : 'success'}>{pwMessage}</Alert> : null}
              </div>
              <div className="flex justify-end border-t border-[var(--border-default)] px-5 py-4">
                <button type="submit" disabled={pwSaving} className="app-btn-primary rounded-lg px-5 py-2.5 text-sm disabled:opacity-50">{pwSaving ? 'Updating…' : 'Update password'}</button>
              </div>
            </Panel>
          ) : null}

          {activeTab === 'security' ? (
            <Panel className="mt-4">
              <PanelHeader
                title="Signed-in devices"
                description="Lost a phone or used a shared computer? End every session. Changing your password already signs out your other devices."
                actions={<button type="button" onClick={handleSignOutEverywhere} className="app-btn-secondary rounded-lg px-4 py-2 text-sm">Sign out on all devices</button>}
              />
            </Panel>
          ) : null}

          {activeTab === 'shop' ? (
            <Panel>
              <PanelHeader
                title={isSuperAdmin ? 'Platform access' : 'Your shop'}
                description={isSuperAdmin ? 'You can see every registered shop.' : 'Edit these in Settings → Shop & receipt.'}
                actions={!isSuperAdmin ? <Link to="/app/settings" className="text-sm font-medium text-[var(--accent)] hover:underline">Open settings</Link> : null}
              />
              <dl className="divide-y divide-[var(--border-default)]">
                {shopFields.map(([label, value]) => (
                  <div key={label} className="grid grid-cols-3 gap-4 px-5 py-3 text-sm">
                    <dt className="text-[var(--text-muted)]">{label}</dt>
                    <dd className="col-span-2 text-[var(--text-primary)]">{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          ) : null}

          {activeTab === 'danger' ? (
            <Panel className="border-[var(--danger-border)]">
              <PanelHeader title="Close account" description="Permanently delete your account. This cannot be undone." />
              <div className="space-y-4 p-5">
                {!isSuperAdmin && profile?.shop ? (
                  <Alert tone="danger">
                    If you are the only person in <strong>{profile.shop.name}</strong>, closing your account also deletes the shop and everything in it
                    {stats ? <>: <strong className="num">{Number(stats.products || 0).toLocaleString()} products, {Number(stats.sales || 0).toLocaleString()} sales and {Number(stats.customers || 0).toLocaleString()} customers</strong></> : null}. Download any reports you need first.
                  </Alert>
                ) : null}
                {closeStep === 'confirm' ? (
                  <button type="button" onClick={handleStartClose} className="rounded-lg border border-[var(--danger-border)] px-4 py-2.5 text-sm font-medium text-[var(--danger)] transition hover:bg-[var(--danger-soft)]">
                    I understand, continue
                  </button>
                ) : (
                  <form onSubmit={handleCloseAccount} className="max-w-md space-y-4">
                    <Field label="Your password">
                      <input type="password" value={closePw} onChange={(e) => setClosePw(e.target.value)} className={fieldInput} autoComplete="current-password" required />
                    </Field>
                    <Field label={<>Type <span className="font-mono text-[var(--danger)]">DELETE</span> to confirm</>}>
                      <input type="text" value={closeConfirmText} onChange={(e) => setCloseConfirmText(e.target.value)} className={`${fieldInput} font-mono`} placeholder="DELETE" autoComplete="off" required />
                    </Field>
                    {closeMessage ? <Alert tone="danger">{closeMessage}</Alert> : null}
                    <div className="flex gap-2">
                      <button type="button" onClick={handleCancelClose} disabled={closing} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Cancel</button>
                      <button type="submit" disabled={closing || closeConfirmText.trim() !== 'DELETE' || !closePw} className="app-btn-danger-solid flex-1 rounded-lg px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">
                        {closing ? 'Closing…' : 'Close account permanently'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </Panel>
          ) : null}
        </div>
      </div>

      {showAvatarModal && avatarPreview ? (
        <Modal
          title="New profile photo"
          subtitle="Save your profile to keep this photo."
          onClose={() => setShowAvatarModal(false)}
          size="sm"
          footer={(
            <>
              <button type="button" onClick={handleRemoveAvatar} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Discard</button>
              <button type="button" onClick={() => setShowAvatarModal(false)} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm">Use photo</button>
            </>
          )}
        >
          <img src={avatarPreview} alt="Preview" className="mx-auto h-40 w-40 rounded-full object-cover ring-1 ring-[var(--border-strong)]" />
        </Modal>
      ) : null}
    </div>
  );
}
