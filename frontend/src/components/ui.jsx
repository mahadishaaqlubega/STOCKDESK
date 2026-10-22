// Shared building blocks so every page shares one visual language.

export function Panel({ children, className = '', as: Tag = 'section', ...rest }) {
  return (
    <Tag className={`app-panel min-w-0 rounded-2xl border ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function PanelHeader({ title, description, actions, className = '' }) {
  return (
    <div className={`flex flex-col gap-3 border-b border-[var(--border-default)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-[var(--text-muted)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const toneText = {
  default: 'text-[var(--text-primary)]',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-300',
  danger: 'text-red-600 dark:text-red-400',
  accent: 'text-[var(--accent)]',
};

// Tinted, softly shaded icon chips (one per tone) for stat tiles.
const chipTones = {
  default: 'from-teal-500/20 to-teal-500/5 text-teal-600 ring-teal-500/15 dark:text-teal-300',
  accent: 'from-teal-500/20 to-teal-500/5 text-teal-600 ring-teal-500/15 dark:text-teal-300',
  success: 'from-emerald-500/20 to-emerald-500/5 text-emerald-600 ring-emerald-500/15 dark:text-emerald-300',
  warning: 'from-amber-500/25 to-amber-500/5 text-amber-600 ring-amber-500/20 dark:text-amber-300',
  danger: 'from-rose-500/20 to-rose-500/5 text-rose-600 ring-rose-500/15 dark:text-rose-300',
  info: 'from-sky-500/20 to-sky-500/5 text-sky-600 ring-sky-500/15 dark:text-sky-300',
  violet: 'from-violet-500/20 to-violet-500/5 text-violet-600 ring-violet-500/15 dark:text-violet-300',
};

const washTones = {
  default: 'bg-teal-500/10',
  accent: 'bg-teal-500/10',
  success: 'bg-emerald-500/10',
  warning: 'bg-amber-500/15',
  danger: 'bg-rose-500/10',
  info: 'bg-sky-500/10',
  violet: 'bg-violet-500/10',
};

// Left edge on every stat tile, echoing the sidebar's active-link marker.
const edgeTones = {
  default: 'border-l-teal-500',
  accent: 'border-l-teal-500',
  success: 'border-l-emerald-500',
  warning: 'border-l-amber-400',
  danger: 'border-l-rose-500',
  info: 'border-l-sky-500',
  violet: 'border-l-violet-500',
};

// Thick coloured left border; being a real border it curves with the
// box's rounded corners.
export function tileEdge(tone = 'default', active = false) {
  return `${active ? 'border-l-4' : 'border-l-[3px]'} ${edgeTones[tone] || edgeTones.default}`;
}

export function IconChip({ tone = 'default', children, size = 'md' }) {
  const dims = size === 'sm' ? 'h-8 w-8 rounded-lg [&>svg]:h-4 [&>svg]:w-4' : 'h-10 w-10 rounded-xl [&>svg]:h-5 [&>svg]:w-5';
  return (
    <span className={`flex shrink-0 items-center justify-center bg-gradient-to-br shadow-sm ring-1 ${dims} ${chipTones[tone] || chipTones.default}`}>
      {children}
    </span>
  );
}

export function StatTile({ label, value, hint, tone = 'default', title, onClick, active, icon, iconTone }) {
  const Comp = onClick ? 'button' : 'div';
  const chip = iconTone || (tone === 'default' ? 'default' : tone);
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? Boolean(active) : undefined}
      className={`app-panel relative min-w-0 overflow-hidden rounded-xl border px-4 py-3 text-left transition ${onClick ? 'hover:border-[var(--border-strong)]' : ''} ${tileEdge(chip, active)} ${active ? 'bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]' : ''}`}
    >
      {icon ? <span className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl ${washTones[chip] || washTones.default}`} aria-hidden="true" /> : null}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-[var(--text-muted)]">{label}</p>
          <p className={`num mt-1 truncate text-xl font-semibold tracking-tight ${toneText[tone] || toneText.default}`} title={title}>{value}</p>
          {hint ? <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{hint}</p> : null}
        </div>
        {icon ? <IconChip tone={chip}>{icon}</IconChip> : null}
      </div>
    </Comp>
  );
}

export function StatGrid({ children, cols = 4 }) {
  const colClass = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' }[cols] || 'lg:grid-cols-4';
  return <section className={`grid grid-cols-2 gap-3 ${colClass}`}>{children}</section>;
}

const badgeTones = {
  neutral: 'bg-[var(--surface-secondary)] text-[var(--text-secondary)]',
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  danger: 'bg-red-500/10 text-red-700 dark:text-red-300',
  info: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent-strong)]',
};

export function Badge({ tone = 'neutral', dot = false, children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${badgeTones[tone] || badgeTones.neutral} ${className}`}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function Tabs({ tabs, value, onChange, label = 'Sections' }) {
  return (
    <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-1" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={value === tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
            value === tab.key ? 'bg-[var(--surface-primary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          {tab.icon}
          {tab.label}
          {tab.count != null ? <span className="num rounded-full bg-[var(--surface-secondary)] px-1.5 text-xs text-[var(--text-muted)]">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search', className = '', ...rest }) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="app-input w-full rounded-lg border py-2 pl-9 pr-3 text-sm"
        {...rest}
      />
    </div>
  );
}

export function EmptyState({ title, message, action, icon }) {
  return (
    <div className="px-4 py-14 text-center">
      {icon ? <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-[var(--text-muted)] [&>svg]:h-5 [&>svg]:w-5">{icon}</div> : null}
      <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
      {message ? <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--text-muted)]">{message}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }) {
  return (
    <div className="space-y-2 p-4" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-[var(--surface-secondary)]" />)}
    </div>
  );
}

export function Alert({ tone = 'info', children, className = '' }) {
  const cls = { info: 'app-alert-info', success: 'app-alert-success', danger: 'app-alert-danger', warning: 'app-alert-warning' }[tone];
  return <div className={`${cls} rounded-lg px-3.5 py-2.5 text-sm ${className}`} role={tone === 'danger' ? 'alert' : 'status'}>{children}</div>;
}

export const fieldLabel = 'block text-sm font-medium text-[var(--text-secondary)]';
export const fieldInput = 'app-input mt-1.5 w-full rounded-lg border px-3 py-2.5 text-sm';

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`${fieldLabel} ${className}`}>
      {label}
      {children}
      {hint ? <span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">{hint}</span> : null}
    </label>
  );
}

function CloseButton({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="-mr-1 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]" aria-label="Close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  );
}

export function Modal({ title, subtitle, onClose, children, footer, size = 'md' }) {
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size];
  return (
    <div className="app-overlay fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`app-modal flex max-h-[92dvh] w-full ${width} flex-col rounded-t-2xl border sm:rounded-2xl`} role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-sm text-[var(--text-muted)]">{subtitle}</p> : null}
          </div>
          <CloseButton onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <div className="flex gap-2 border-t border-[var(--border-default)] px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Drawer({ title, onClose, onSubmit, children, footer }) {
  const Tag = onSubmit ? 'form' : 'div';
  return (
    <div className="app-overlay fixed inset-0 z-50 flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Tag onSubmit={onSubmit} className="app-modal flex h-full w-full max-w-md flex-col border-l" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-[var(--border-default)] px-5 py-4">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <div className="flex gap-2 border-t border-[var(--border-default)] px-5 py-4">{footer}</div> : null}
      </Tag>
    </div>
  );
}

export function IconButton({ label, onClick, tone = 'default', children, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition disabled:opacity-40 ${
        tone === 'danger' ? 'hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]' : 'hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]'
      }`}
    >
      {children}
    </button>
  );
}

export const statIcons = {
  box: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m21 8-9-5-9 5 9 5 9-5Z" /><path d="m3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>,
  money: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9v.01M18 15v.01" /></svg>,
  alert: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>,
  low: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17h4l3-6 4 8 3-5h4" /></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-2.5-5.1" /></svg>,
  credit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></svg>,
  repeat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>,
  receipt: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2Z" /><path d="M9 8h6M9 12h6" /></svg>,
  store: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V8l7-4 7 4v13" /><path d="M10 21v-4h4v4" /></svg>,
  pulse: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>,
  key: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>,
};

export const icons = {
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M12 5v14M5 12h14" /></svg>,
  edit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" /></svg>,
  trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>,
  key: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14 9l2 2" /></svg>,
  eye: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>,
  download: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>,
  refresh: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg>,
  chevronRight: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="m9 6 6 6-6 6" /></svg>,
  back: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M15 6l-6 6 6 6" /></svg>,
};

export function Toast({ text, tone = 'neutral' }) {
  if (!text) return null;
  const toneClass = tone === 'danger' ? 'bg-red-600 text-white' : 'bg-[var(--surface-inverse)] text-[var(--bg-app)]';
  return (
    <div className={`fixed bottom-4 left-1/2 z-[60] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm shadow-[var(--shadow-raised)] ${toneClass}`} role="status">
      {text}
    </div>
  );
}
