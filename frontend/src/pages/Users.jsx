import { useEffect, useState } from 'react';
import { fetchUsers, createUser, deleteUser } from '../utils/api';
import { getUser } from '../utils/auth';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import ConfirmDialog from '../components/ConfirmDialog';

const ROLE_OPTIONS = ['Admin', 'Manager', 'Cashier'];
const initialForm = { name: '', username: '', password: '', displayRole: 'Cashier' };

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="m1 1 22 22" />
      <path d="M10.73 10.73a3 3 0 0 0 4.1 4.1" />
    </svg>
  );
}

function StatCard({ label, value, helper, tone = 'default' }) {
  const valueClass = {
    default: 'text-[var(--text-primary)]',
    success: 'text-[var(--success)]',
    danger: 'text-[var(--danger)]',
    warning: 'text-[var(--warning)]',
  }[tone];
  const borderAccent = {
    default: 'border-l-[var(--accent)]',
    success: 'border-l-[var(--success)]',
    danger: 'border-l-[var(--danger)]',
    warning: 'border-l-[var(--warning)]',
  }[tone];

  return (
    <div className={`app-panel rounded-[1.2rem] border border-l-[3px] ${borderAccent} p-4 transition hover:shadow-lg`}>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">{label}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${valueClass}`}>{value}</p>
      <p className="mt-1.5 text-[12px] text-[var(--text-muted)]">{helper}</p>
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserDisplayRole, setNewUserDisplayRole] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const currentUser = getUser();
  const [deleteTarget, setDeleteTarget] = useState(null);

  useBodyScrollLock(showPasswordModal || Boolean(deleteTarget));
  const adminCount = users.filter((user) => (user.displayRole || user.role) === 'Admin').length;
  const managerCount = users.filter((user) => (user.displayRole || user.role) === 'Manager').length;
  const cashierCount = users.filter((user) => (user.displayRole || user.role) === 'Cashier' || ((user.displayRole || user.role) === 'Staff')).length;

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    const strongPw = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
    if (!strongPw.test(form.password)) {
      setMessage('Password must be at least 8 characters and include letters, numbers, and a special character.');
      return;
    }
    try {
      const response = await createUser({
        name: form.name,
        username: form.username,
        password: form.password,
        confirmPassword: form.password,
        role: form.displayRole,
        displayRole: form.displayRole,
      });
      setNewUserPassword(response.plainPassword);
      setNewUserUsername(response.username || '');
      setNewUserName(response.name || '');
      setNewUserDisplayRole(response.displayRole || response.role || '');
      setShowPasswordModal(true);
      setMessage('User created successfully.');
      setForm(initialForm);
      await loadUsers();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const handleDelete = async (userId) => {
    if (userId === currentUser?.id) {
      setMessage('Cannot delete your own account.');
      return;
    }
    try {
      await deleteUser(userId);
      setMessage('User deleted successfully.');
      await loadUsers();
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <section className="app-panel rounded-[2rem] border p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">User Management</h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">Create clean team accounts with a full name, username, password, and assigned role.</p>
          </div>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:min-w-[580px]">
            <StatCard label="Total Users" value={users.length.toLocaleString()} helper="All shop accounts." />
            <StatCard label="Admins" value={adminCount.toLocaleString()} helper="Full-access accounts." />
            <StatCard label="Managers" value={managerCount.toLocaleString()} helper="Operational supervisors." />
            <StatCard label="Cashiers" value={cashierCount.toLocaleString()} helper="Frontline sales users." />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="app-panel rounded-[2rem] border p-6">
          <div className="app-alert-info mb-4 rounded-2xl px-4 py-3 text-sm">
            Passwords are shown once after account creation. Store them safely before closing the confirmation screen.
          </div>
          <div className="overflow-x-auto rounded-2xl border border-[var(--border-default)]">
            <table className="table-cards min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="app-table-head">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)] bg-[var(--surface-primary)]">
                {users.map((user) => (
                  <tr key={user.id} className="app-row-hover transition">
                    <td data-label="Name" className="px-4 py-3 font-medium text-[var(--text-primary)]">{user.name || '-'}</td>
                    <td data-label="Username" className="px-4 py-3">{user.username || '-'}</td>
                    <td data-label="Email" className="px-4 py-3">
                      {user.email ? (
                        <div className="flex items-center justify-end gap-1.5 md:justify-start">
                          <span className="min-w-0 break-words text-sm text-[var(--text-primary)]">{user.email}</span>
                          {user.isVerified ? (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--success-border)] bg-[var(--success-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--success)]">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-2.5 w-2.5"><polyline points="20 6 9 17 4 12" /></svg>
                              Verified
                            </span>
                          ) : (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--warning-border)] bg-[var(--warning-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--warning)]">
                              Pending
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td data-label="Role" className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        (user.displayRole || user.role) === 'Admin'
                          ? 'app-panel-accent'
                          : (user.displayRole || user.role) === 'Manager'
                            ? 'app-alert-warning'
                            : 'app-alert-success'
                      }`}>
                        {user.displayRole || user.role}
                      </span>
                    </td>
                    <td data-label="Created" className="px-4 py-3">{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td data-label="Action" className="px-4 py-3">
                      <button
                        onClick={() => setDeleteTarget(user)}
                        disabled={user.id === currentUser?.id}
                        className="app-btn-danger rounded-lg px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="app-panel rounded-[2rem] border p-6">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Create Team Account</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Set the user’s full name, username, password, and operational role.</p>
          <form className="mt-4 space-y-4" onSubmit={handleCreate}>
            <label className="block text-sm text-[var(--text-secondary)]">Full Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="app-input w-full rounded-3xl border px-4 py-3"
            />
            <label className="block text-sm text-[var(--text-secondary)]">Username</label>
            <input
              value={form.username}
              onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
              className="app-input w-full rounded-3xl border px-4 py-3"
            />
            <label className="block text-sm text-[var(--text-secondary)]">Role</label>
            <select
              value={form.displayRole}
              onChange={(e) => setForm((prev) => ({ ...prev, displayRole: e.target.value }))}
              className="app-input w-full rounded-3xl border px-4 py-3"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <label className="block text-sm text-[var(--text-secondary)]">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                className="app-input w-full rounded-3xl border px-4 py-3 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-4 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <button className="app-btn-primary w-full rounded-3xl px-4 py-3 transition">Create User</button>
          </form>

          {message && (
            <div
              className={`mt-4 rounded-3xl px-4 py-3 text-sm ${
                message.includes('success') ? 'app-alert-success' : 'app-alert-danger'
              }`}
            >
              {message}
            </div>
          )}
        </div>
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="app-overlay fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="app-modal mx-4 w-full max-w-md rounded-[1.5rem] border p-6">
            <h3 className="mb-4 text-lg font-bold text-[var(--accent-strong)]">User Created Successfully</h3>
            <p className="mb-4 text-sm text-[var(--text-soft)]">
              Share these login details with the new user.
            </p>

            <div className="app-panel-soft mb-4 rounded-xl border p-4">
              <p className="mb-1 text-xs text-[var(--text-muted)]">Full Name:</p>
              <input
                type="text"
                readOnly
                value={newUserName}
                className="app-btn-secondary w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            <div className="app-panel-soft mb-4 rounded-xl border p-4">
              <p className="mb-1 text-xs text-[var(--text-muted)]">Assigned Role:</p>
              <input
                type="text"
                readOnly
                value={newUserDisplayRole}
                className="app-btn-secondary w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            <div className="app-panel-soft mb-4 rounded-xl border p-4">
              <p className="mb-1 text-xs text-[var(--text-muted)]">Login Username:</p>
              <input
                type="text"
                readOnly
                value={newUserUsername}
                className="app-btn-secondary w-full rounded-lg border px-3 py-2 text-sm font-mono"
              />
            </div>
            
            <div className="app-panel-soft mb-4 rounded-xl border p-4">
              <p className="mb-1 text-xs text-[var(--text-muted)]">Login Password:</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={newUserPassword}
                  className="app-btn-secondary flex-1 rounded-lg border px-3 py-2 text-sm font-mono"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(newUserPassword);
                    setMessage('Password copied to clipboard!');
                  }}
                  className="app-btn-primary rounded-lg px-3 py-2 text-sm transition"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="app-alert-warning mb-4 rounded-xl px-4 py-3 text-sm">
              Save this password now. StockDesk stores hashed passwords and cannot reveal them later.
            </div>

            <button
              onClick={() => setShowPasswordModal(false)}
              className="app-btn-subtle w-full rounded-lg px-4 py-2 transition"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {deleteTarget ? (
        <ConfirmDialog
          title="Delete user?"
          message={
            <>
              Delete <strong className="font-semibold text-[var(--text-primary)]">{deleteTarget.name || deleteTarget.username}</strong> permanently? This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            handleDelete(target.id);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}
    </div>
  );
}
