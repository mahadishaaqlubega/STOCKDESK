import { useEffect, useRef } from 'react';
import useBodyScrollLock from '../hooks/useBodyScrollLock';

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export default function ConfirmDialog({
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}) {
  useBodyScrollLock(true);
  const cancelRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    cancelRef.current?.focus();

    return () => {
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, []);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      style={{ background: 'var(--overlay)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-md rounded-2xl border bg-[var(--surface-primary)] p-6"
        style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.32)' }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${danger ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : 'bg-[var(--accent-soft)] text-[var(--accent)]'}`}>
          <AlertIcon />
        </div>

        <h3 className="mt-4 text-lg font-bold text-[var(--text-primary)]">{title}</h3>
        {message ? (
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{message}</p>
        ) : null}

        <div className="mt-6 flex gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-secondary)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-tertiary)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 ${
              danger ? 'bg-[var(--danger)] hover:bg-[var(--danger-hover)]' : 'app-btn-primary'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}