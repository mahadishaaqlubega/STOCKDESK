import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from './ui';
import { canPromptInstall, devicePlatform, isInstalled, promptInstall, subscribeInstall } from '../utils/installPrompt';

const DISMISS_KEY = 'sd-install-dismissed-until';
const DISMISS_DAYS = 30;

function dismissedRecently() {
  try {
    return Number(window.localStorage.getItem(DISMISS_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

// Re-renders when the browser's install offer arrives or is used.
export function useInstallState() {
  const [, setTick] = useState(0);
  useEffect(() => subscribeInstall(() => setTick((n) => n + 1)), []);
  return { installed: isInstalled(), canPrompt: canPromptInstall(), platform: devicePlatform() };
}

const GUIDES = {
  android: {
    title: 'Android phone or tablet',
    steps: [
      'Open StockDesk in Chrome.',
      'Tap the menu (⋮) at the top right.',
      'Tap "Add to Home screen" or "Install app", then "Install".',
    ],
    after: 'StockDesk appears on your home screen and in your apps, and opens straight into your shop.',
  },
  ios: {
    title: 'iPhone or iPad',
    steps: [
      'Open StockDesk in Safari (or Chrome).',
      'Tap the Share button (the square with an arrow): at the bottom in Safari, at the top right in Chrome.',
      'Scroll down, tap "Add to Home Screen", then "Add".',
    ],
    after: 'StockDesk appears on your home screen like any other app.',
  },
  desktop: {
    title: 'Computer (Chrome or Edge)',
    steps: [
      'Open StockDesk in Chrome or Microsoft Edge.',
      'Click the install icon at the right end of the address bar (a screen with a small arrow).',
      'No icon? Chrome: menu (⋮) → "Cast, save and share" → "Install page as app". Edge: menu (…) → "Apps" → "Install this site as an app".',
    ],
    after: 'StockDesk gets its own window and an icon on your desktop and taskbar. Pin it for one-click opening.',
  },
};

export function InstallGuide({ onClose }) {
  const { canPrompt, platform } = useInstallState();
  const order = [platform, ...Object.keys(GUIDES).filter((key) => key !== platform)];

  const install = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') onClose();
  };

  // Rendered on <body>: the sidebar is transformed, which would otherwise
  // trap a fixed overlay inside its narrow column.
  return createPortal(
    <Modal
      title="Open StockDesk in one tap"
      subtitle="Install it once, then open it from your home screen or desktop. No typing the address, no app store."
      onClose={onClose}
      footer={canPrompt ? (
        <>
          <button type="button" onClick={onClose} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Later</button>
          <button type="button" onClick={install} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm">Install on this device</button>
        </>
      ) : null}
    >
      <div className="space-y-5">
        {order.map((key, index) => {
          const guide = GUIDES[key];
          return (
            <section key={key} className={index ? 'border-t border-[var(--border-default)] pt-5' : ''}>
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                {guide.title}
                {key === platform ? <span className="ml-2 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--accent-strong)]">This device</span> : null}
              </h4>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
                {guide.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <p className="mt-2 text-xs text-[var(--text-muted)]">{guide.after}</p>
            </section>
          );
        })}
        <p className="text-xs text-[var(--text-muted)]">The installed app is the same StockDesk, always up to date, and keeps selling when the network drops.</p>
      </div>
    </Modal>,
    document.body,
  );
}

// A slim, dismissible strip at the top of the app until StockDesk is
// installed on this device.
export function InstallBanner() {
  const { installed, canPrompt, platform } = useInstallState();
  const [hidden, setHidden] = useState(dismissedRecently);
  const [guideOpen, setGuideOpen] = useState(false);

  // Computers without an install offer (e.g. Firefox) get no banner; the
  // menu's "Install app" link still explains the options.
  if (installed || hidden || (!canPrompt && platform === 'desktop')) {
    return guideOpen ? <InstallGuide onClose={() => setGuideOpen(false)} /> : null;
  }

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86400000));
    } catch {
      // Private mode: just hide it for this visit.
    }
    setHidden(true);
  };

  const install = async () => {
    if (canPrompt) {
      const outcome = await promptInstall();
      if (outcome === 'accepted') setHidden(true);
    } else {
      setGuideOpen(true);
    }
  };

  return (
    <>
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-primary)] px-3.5 py-2.5 text-sm shadow-[var(--shadow-card)]">
        <img src="/icon-192.png" alt="" className="h-8 w-8 shrink-0 rounded-lg" />
        <p className="min-w-0 flex-1 text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">Open StockDesk in one tap.</span>{' '}
          <span className="hidden sm:inline">Add it to this {platform === 'desktop' ? 'computer' : 'phone'} so you never type the address again.</span>
        </p>
        <button type="button" onClick={install} className="app-btn-primary shrink-0 rounded-lg px-3 py-1.5 text-sm">
          {canPrompt ? 'Install' : 'Show me how'}
        </button>
        <button type="button" onClick={dismiss} className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]" aria-label="Not now">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      {guideOpen ? <InstallGuide onClose={() => setGuideOpen(false)} /> : null}
    </>
  );
}
