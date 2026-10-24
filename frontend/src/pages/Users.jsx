import { useEffect, useMemo, useState } from 'react';
import { fetchUsers, createUser, deleteUser, resetUserPassword } from '../utils/api';
import { getUser } from '../utils/auth';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import ConfirmDialog from '../components/ConfirmDialog';
import { Badge, Drawer, EmptyState, Field, IconButton, Modal, Panel, SearchInput, SkeletonRows, StatGrid, StatTile, Toast, fieldInput, icons, statIcons } from '../components/ui';

const ROLE_OPTIONS = [
  { value: 'Cashier', hint: 'Sells, takes payments, manages customers' },
  { value: 'Manager', hint: 'Day-to-day running of the shop' },
  { value: 'Admin', hint: 'Full access, including settings and reports' },
];
const initialForm = { name: '', username: '', password: '', displayRole: 'Cashier' };
const STRONG_PASSWORD = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

// Readable but strong: letters + digits + one symbol, no look-alike characters.
function generatePassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%&*?';
  const random = (set) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [random(symbols), random(digits), random(digits)];
  while (chars.length < 10) chars.push(random(letters));
  return chars.sort(() => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 - 0.5).join('');
}

const roleTone = { Admin: 'accent', Manager: 'warning', Cashier: 'success', Staff: 'success' };

function PasswordField({ value, onChange, label = 'Password' }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} hint="At least 8 characters with a letter, a number and a symbol.">
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${fieldInput} pr-28 font-mono`}
          autoComplete="new-password"
          required
        />
        <div className="absolute inset-y-0 right-1.5 mt-1.5 flex items-center gap-1">
          <button type="button" onClick={() => setVisible((v) => !v)} className="rounded-md px-1.5 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label={visible ? 'Hide password' : 'Show password'}>
            {visible ? 'Hide' : 'Show'}
          </button>
          <button type="button" onClick={() => { onChange(generatePassword()); setVisible(true); }} className="rounded-md bg-[var(--surface-secondary)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)]">
            Generate
          </button>
        </div>
      </div>
    </Field>
  );
}

export default function Users() {
  const currentUser = getUser();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(initialForm);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetError, setResetError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState('');

  useBodyScrollLock(drawerOpen || Boolean(credentials) || Boolean(resetTarget) || Boolean(deleteTarget));

  const flash = (text) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 3000);
  };

  const loadUsers = async () => {
    try {
      setUsers(await fetchUsers());
    } catch (error) {
      flash(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const roleOf = (user) => user.displayRole || user.role;
  const counts = useMemo(() => ({
    admin: users.filter((u) => roleOf(u) === 'Admin').length,
    manager: users.filter((u) => roleOf(u) === 'Manager').length,
    cashier: users.filter((u) => ['Cashier', 'Staff'].includes(roleOf(u))).length,
  }), [users]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => [u.name, u.username, u.email].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [users, search]);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!STRONG_PASSWORD.test(form.password)) {
      setFormError('Password needs at least 8 characters with a letter, a number and a symbol, or press Generate.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const response = await createUser({
        name: form.name,
        username: form.username,
        password: form.password,
        confirmPassword: form.password,
        role: form.displayRole,
        displayRole: form.displayRole,
      });
      setCredentials({
        title: 'Account created',
        name: response.name,
        role: response.displayRole || response.role,
        username: response.username,
        password: response.plainPassword,
      });
      setDrawerOpen(false);
      setForm(initialForm);
      await loadUsers();
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (event) => {
    event.preventDefault();
    if (!STRONG_PASSWORD.test(resetPasswordValue)) {
      setResetError('Password needs at least 8 characters with a letter, a number and a symbol, or press Generate.');
      return;
    }
    try {
      const response = await resetUserPassword(resetTarget.id, { password: resetPasswordValue, confirmPassword: resetPasswordValue });
      setCredentials({
        title: 'Password reset',
        name: resetTarget.name,
        role: roleOf(resetTarget),
        username: response.username || resetTarget.username,
        password: response.plainPassword || resetPasswordValue,
      });
      setResetTarget(null);
    } catch (error) {
      setResetError(error.message);
    }
  };

  const handleDelete = async (user) => {
    try {
      await deleteUser(user.id);
      flash(`${user.name || user.username} removed.`);
      await loadUsers();
    } catch (error) {
      flash(error.message);
    }
  };

  const copyCredentials = async () => {
    const text = `StockDesk login\nShop: ${currentUser?.shop?.name || ''}\nUsername: ${credentials.username}\nPassword: ${credentials.password}`;
    try {
      await navigator.clipboard.writeText(text);
      flash('Login details copied.');
    } catch {
      flash('Copy failed. Select and copy the details manually.');
    }
  };

  return (
    <div className="space-y-5">
      <StatGrid>
        <StatTile label="Team members" value={users.length.toLocaleString()} hint="Accounts in this shop"  icon={statIcons.users} />
        <StatTile label="Admins" value={counts.admin.toLocaleString()} hint="Full access"  icon={statIcons.key} iconTone="accent" />
        <StatTile label="Managers" value={counts.manager.toLocaleString()} hint="Run the shop day to day"  icon={statIcons.users} iconTone="warning" />
        <StatTile label="Cashiers" value={counts.cashier.toLocaleString()} hint="Sell at the counter"  icon={statIcons.receipt} iconTone="success" />
      </StatGrid>

      <Panel>
        <div className="flex flex-col gap-3 border-b border-[var(--border-default)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search team" className="sm:w-72" />
          <button type="button" onClick={() => { setForm(initialForm); setFormError(''); setDrawerOpen(true); }} className="app-btn-primary inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm">
            {icons.plus}
            Add team member
          </button>
        </div>

        {loading ? (
          <SkeletonRows rows={3} />
        ) : visible.length === 0 ? (
          <EmptyState title="No team members found" message="Add cashiers and managers so everyone signs in with their own account." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-cards min-w-full text-left text-sm">
              <thead className="app-table-head">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Member</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Joined</th>
                  <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {visible.map((user) => {
                  const isSelf = user.id === currentUser?.id;
                  return (
                    <tr key={user.id} className="app-row-hover">
                      <td data-label="Member" className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-secondary)] md:flex">
                            {String(user.name || user.username || 'U').slice(0, 1).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--text-primary)]">{user.name || user.username}{isSelf ? <span className="ml-1.5 text-xs font-normal text-[var(--text-muted)]">(you)</span> : null}</p>
                            <p className="font-mono text-xs text-[var(--text-muted)]">@{user.username}</p>
                          </div>
                        </div>
                      </td>
                      <td data-label="Role" className="px-4 py-2.5"><Badge tone={roleTone[roleOf(user)] || 'neutral'}>{roleOf(user)}</Badge></td>
                      <td data-label="Email" className="px-4 py-2.5">
                        {user.email ? (
                          <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                            {user.email}
                            {user.isVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Pending</Badge>}
                          </span>
                        ) : <span className="text-[var(--text-muted)]">-</span>}
                      </td>
                      <td data-label="Joined" className="px-4 py-2.5 text-[var(--text-muted)]">{new Date(user.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td data-label="Actions" className="px-4 py-2.5">
                        <div className="flex justify-end">
                          <IconButton label={`Reset password for ${user.username}`} onClick={() => { setResetTarget(user); setResetPasswordValue(''); setResetError(''); }}>{icons.key}</IconButton>
                          <IconButton label={isSelf ? 'You cannot remove yourself' : `Remove ${user.username}`} tone="danger" disabled={isSelf} onClick={() => setDeleteTarget(user)}>{icons.trash}</IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {drawerOpen ? (
        <Drawer
          title="Add team member"
          onClose={() => setDrawerOpen(false)}
          onSubmit={handleCreate}
          footer={(
            <>
              <button type="button" onClick={() => setDrawerOpen(false)} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Cancel</button>
              <button type="submit" disabled={saving} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm disabled:opacity-60">{saving ? 'Creating…' : 'Create account'}</button>
            </>
          )}
        >
          <Field label="Full name">
            <input autoFocus required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className={fieldInput} placeholder="e.g. Sarah Nakato" />
          </Field>
          <Field label="Username" hint="Used to sign in together with the shop name.">
            <input required value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} className={`${fieldInput} font-mono`} placeholder="sarah" autoComplete="off" />
          </Field>
          <div>
            <p className="text-sm font-medium text-[var(--text-secondary)]">Role</p>
            <div className="mt-1.5 space-y-2" role="radiogroup" aria-label="Role">
              {ROLE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={form.displayRole === option.value}
                  onClick={() => setForm((p) => ({ ...p, displayRole: option.value }))}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${form.displayRole === option.value ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border-strong)] hover:border-[var(--text-muted)]'}`}
                >
                  <span>
                    <span className="block text-sm font-medium text-[var(--text-primary)]">{option.value}</span>
                    <span className="block text-xs text-[var(--text-muted)]">{option.hint}</span>
                  </span>
                  <span className={`h-4 w-4 rounded-full border-2 ${form.displayRole === option.value ? 'border-[var(--accent)] bg-[var(--accent)] shadow-[inset_0_0_0_2px_var(--surface-primary)]' : 'border-[var(--border-strong)]'}`} />
                </button>
              ))}
            </div>
          </div>
          <PasswordField value={form.password} onChange={(value) => setForm((p) => ({ ...p, password: value }))} />
          {formError ? <p className="app-alert-danger rounded-lg px-3 py-2 text-sm" role="alert">{formError}</p> : null}
        </Drawer>
      ) : null}

      {resetTarget ? (
        <Modal
          title={`Reset password`}
          subtitle={`${resetTarget.name || resetTarget.username} will sign in with the new password.`}
          onClose={() => setResetTarget(null)}
          size="sm"
        >
          <form onSubmit={handleReset} className="space-y-4">
            <PasswordField label="New password" value={resetPasswordValue} onChange={setResetPasswordValue} />
            {resetError ? <p className="app-alert-danger rounded-lg px-3 py-2 text-sm" role="alert">{resetError}</p> : null}
            <button type="submit" className="app-btn-primary w-full rounded-lg px-4 py-2.5 text-sm">Reset password</button>
          </form>
        </Modal>
      ) : null}

      {credentials ? (
        <Modal
          title={credentials.title}
          subtitle="Share these details with the team member. They are shown only once."
          onClose={() => setCredentials(null)}
          size="sm"
          footer={(
            <>
              <button type="button" onClick={copyCredentials} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Copy details</button>
              <button type="button" onClick={() => setCredentials(null)} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm">Done</button>
            </>
          )}
        >
          <dl className="divide-y divide-[var(--border-default)] rounded-lg border border-[var(--border-default)] text-sm">
            {[
              ['Name', credentials.name],
              ['Role', credentials.role],
              ['Shop', currentUser?.shop?.name],
              ['Username', credentials.username, true],
              ['Password', credentials.password, true],
            ].map(([label, value, mono]) => (
              <div key={label} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <dt className="text-[var(--text-muted)]">{label}</dt>
                <dd className={`select-all text-right font-medium text-[var(--text-primary)] ${mono ? 'font-mono' : ''}`}>{value || '-'}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-[var(--text-muted)]">StockDesk stores passwords securely and cannot show this one again.</p>
        </Modal>
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title="Remove team member?"
          message={<>Remove <strong className="font-semibold text-[var(--text-primary)]">{deleteTarget.name || deleteTarget.username}</strong>? They will no longer be able to sign in.</>}
          confirmLabel="Remove"
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            handleDelete(target);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}

      <Toast text={toast} />
    </div>
  );
}
