// Error alerts (Sentry). Loaded by server.js before Express and Postgres so
// it can watch them. Sends nothing in development or tests unless
// SENTRY_ENABLED=true. Shop data stays out: no IP addresses, headers,
// cookies, request bodies or variable values, and share-link tokens are
// blanked from URLs.
const Sentry = require('@sentry/node');

const DEFAULT_DSN = 'https://5077fc6347ee507fd87178c9088a1739@o4512324459167744.ingest.de.sentry.io/4512346592247888';

const scrubTokens = (value) =>
  typeof value === 'string' ? value.replace(/\/public\/(receipts|quotations)\/[^/?#\s]+/g, '/public/$1/:token') : value;

function scrub(event) {
  if (event.request?.url) event.request.url = scrubTokens(event.request.url);
  if (event.transaction) event.transaction = scrubTokens(event.transaction);
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

Sentry.init({
  dsn: process.env.SENTRY_DSN || DEFAULT_DSN,
  enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_ENABLED === 'true',
  environment: process.env.SENTRY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'development',
  release: process.env.RAILWAY_GIT_COMMIT_SHA || undefined,
  debug: process.env.SENTRY_DEBUG === 'true',
  serverName: 'stockdesk-api',
  initialScope: { tags: { component: 'api' } },
  tracesSampleRate: 0.1,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    queryParams: false,
    httpBodies: [],
    stackFrameVariables: false,
  },
  beforeSend: scrub,
  beforeSendSpan: scrubSpan,
});

module.exports = Sentry;
