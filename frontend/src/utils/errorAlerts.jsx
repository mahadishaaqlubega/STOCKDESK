import * as Sentry from '@sentry/react';

// Error alerts (Sentry) for the live app only. Shop data stays out: no IP
// addresses, headers, cookies, bodies or variable values, and share-link
// tokens are blanked from URLs.
const DSN = 'https://5077fc6347ee507fd87178c9088a1739@o4512324459167744.ingest.de.sentry.io/4512346592247888';

const scrubTokens = (value) =>
  typeof value === 'string' ? value.replace(/\/public\/(receipts|quotations)\/[^/?#\s]+/g, '/public/$1/:token') : value;

function scrub(event) {
  if (event.request?.url) event.request.url = scrubTokens(event.request.url);
  if (event.transaction) event.transaction = scrubTokens(event.transaction);
  (event.breadcrumbs || []).forEach((crumb) => {
    if (crumb.data?.url) crumb.data.url = scrubTokens(crumb.data.url);
  });
  return event;
}

// Performance data (spans) carries URLs too.
function scrubSpan(span) {
  if (span.description) span.description = scrubTokens(span.description);
  if (span.name) span.name = scrubTokens(span.name);
  for (const bag of [span.data, span.attributes]) {
    if (!bag || typeof bag !== 'object') continue;
    for (const key of Object.keys(bag)) {
      const value = bag[key];
      if (typeof value === 'string') bag[key] = scrubTokens(value);
      else if (value && typeof value.value === 'string') value.value = scrubTokens(value.value);
    }
  }
  return span;
}

export function initErrorAlerts() {
  if (!import.meta.env.PROD || import.meta.env.VITE_SENTRY_DSN === 'off') return;
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN || DSN,
    environment: import.meta.env.VITE_VERCEL_ENV || 'production',
    release: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || undefined,
    initialScope: { tags: { component: 'app' } },
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.05,
    // Trace headers only to our own API (its CORS allows them).
    tracePropagationTargets: [/^https:\/\/api\.stockdeskinventory\.com\/api/],
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      queryParams: false,
      httpBodies: [],
      stackFrameVariables: false,
    },
    // Lost connections are normal for a till that works offline, not bugs.
    ignoreErrors: ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource', 'The network connection was lost', /^Session expired/, /ResizeObserver loop/],
    beforeSend: scrub,
    beforeSendSpan: scrubSpan,
  });
}

// Shown instead of a blank screen if a page crashes; the error is reported.
export function CrashScreen() {
  return (
    <div className="flex min-h-app items-center justify-center px-4 pb-8 pt-[calc(env(safe-area-inset-top)+2rem)]" style={{ background: 'var(--bg-app)' }}>
      <div className="app-panel max-w-sm rounded-2xl border p-6 text-center">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Something went wrong</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">We have been told about it. Reload to carry on; sales saved offline are kept on this device.</p>
        <button type="button" onClick={() => window.location.reload()} className="app-btn-primary mt-5 w-full rounded-lg px-4 py-2.5 text-sm">Reload</button>
      </div>
    </div>
  );
}

export const ErrorBoundary = Sentry.ErrorBoundary;
