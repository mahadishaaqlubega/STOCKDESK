const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const customerRoutes = require('./routes/customers');
const productRoutes = require('./routes/products');
const saleRoutes = require('./routes/sales');
const settingsRoutes = require('./routes/settings');
const shopsRoutes = require('./routes/shops');
const reportRoutes = require('./routes/reports');
const printerRoutes = require('./routes/printer');
const adminRoutes = require('./routes/admin');
const expenseRoutes = require('./routes/expenses');
const auditRoutes = require('./routes/audit');
const stockReconciliationRoutes = require('./routes/stockReconciliation');
const profileRoutes = require('./routes/profile');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// Security middleware: trust proxy, limit request size
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Security headers: prevent common vulnerabilities
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Restrict what API responses may load. Skipped for receipt PDFs so inline
  // PDF rendering in the browser's viewer is not blocked.
  if (!req.path.endsWith('/receipt')) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  }
  next();
});

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function patternToRegex(pattern) {
  return new RegExp(`^${escapeRegex(pattern).replace(/\*/g, '.*')}$`);
}

function getAllowedOrigins() {
  const configuredOrigins = (process.env.CORS_ORIGINS || '')
    .split(/[\s,]+/)
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins.length > 0
    ? configuredOrigins
    : ['http://localhost:5173', 'http://localhost:3000'];
}

function getAllowedOriginPatterns() {
  return (process.env.CORS_ORIGIN_PATTERNS || '')
    .split(/[\s,]+/)
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .map(patternToRegex);
}

function isOriginAllowed(origin) {
  const allowedOrigins = getAllowedOrigins();
  const allowedPatterns = getAllowedOriginPatterns();

  return allowedOrigins.includes(origin) || allowedPatterns.some((pattern) => pattern.test(origin));
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || isOriginAllowed(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true
}));

// Rate limiting — generous limits to avoid blocking legitimate users
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many signup attempts. Please wait before trying again.' },
  skipSuccessfulRequests: true, // only count failed attempts
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please wait before trying again.' },
  skipSuccessfulRequests: true,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please wait before trying again.' },
});

app.get('/api', (req, res) => {
  res.json({ message: 'Backend is running', status: 'OK' });
});

// Apply rate limiters to specific auth routes before the router
app.post('/api/auth/signup', signupLimiter);
app.post('/api/auth/login', loginLimiter);
app.post('/api/auth/forgot-password', authLimiter);
app.post('/api/auth/resend-verification', authLimiter);

// CRUD rate limiter — protects all data endpoints
const crudLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' },
});

app.use('/api/users', crudLimiter);
app.use('/api/customers', crudLimiter);
app.use('/api/products', crudLimiter);
app.use('/api/sales', crudLimiter);
app.use('/api/expenses', crudLimiter);
app.use('/api/audit', crudLimiter);
app.use('/api/stock-reconciliation', crudLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/shops', shopsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/printer', printerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/stock-reconciliation', stockReconciliationRoutes);
app.use('/api/profile', profileRoutes);

app.use(errorHandler);

module.exports = app;
