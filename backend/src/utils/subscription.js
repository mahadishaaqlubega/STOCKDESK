// Subscription status and billing configuration.
//
// A shop is in one of these states:
//   trial    - inside its free trial (trialEndsAt in the future), nothing paid beyond it
//   active   - paid through paidUntil
//   past_due - trial or paid period ended less than graceDays ago; everything still works
//   expired  - past the grace period; the shop becomes read-only until it pays
// Data is never deleted because of billing.

const DAY = 86400000;

const DEFAULT_CONFIG = {
  trialDays: 30,
  graceDays: 7,
  currency: 'UGX',
  plans: [
    { key: 'starter', name: 'Starter', price: 15000, staffLimit: 2 },
    { key: 'growth', name: 'Growth', price: 30000, staffLimit: 8 },
    { key: 'business', name: 'Business', price: 90000, staffLimit: null },
  ],
  payTo: {
    mtnNumber: '',
    airtelNumber: '0742 226 839',
    accountName: 'Mahad Ishaaq Lubega',
    instructions: 'Send the amount by Mobile Money, then enter the transaction ID below. We confirm payments within a few hours.',
  },
  supportWhatsapp: '256742226839',
};

let cache = null;
let cacheAt = 0;

function getModels() {
  // Required lazily: models/shop.js calls into this file from a hook.
  return require('../models');
}

async function getBillingConfig({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cacheAt < 60000) return cache;
  let stored = {};
  try {
    const { PlatformSetting } = getModels();
    const row = PlatformSetting ? await PlatformSetting.findByPk('billing') : null;
    stored = (row && row.value) || {};
  } catch {
    stored = {};
  }
  cache = {
    ...DEFAULT_CONFIG,
    ...stored,
    payTo: { ...DEFAULT_CONFIG.payTo, ...(stored.payTo || {}) },
    plans: Array.isArray(stored.plans) && stored.plans.length ? stored.plans : DEFAULT_CONFIG.plans,
  };
  cacheAt = Date.now();
  return cache;
}

async function saveBillingConfig(input) {
  const current = await getBillingConfig({ fresh: true });
  const next = { ...current };
  const int = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v))));

  if (input.trialDays != null && Number.isFinite(Number(input.trialDays))) next.trialDays = int(input.trialDays, 0, 365);
  if (input.graceDays != null && Number.isFinite(Number(input.graceDays))) next.graceDays = int(input.graceDays, 0, 60);
  if (input.payTo && typeof input.payTo === 'object') {
    const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
    next.payTo = {
      mtnNumber: clean(input.payTo.mtnNumber, 32),
      airtelNumber: clean(input.payTo.airtelNumber, 32),
      accountName: clean(input.payTo.accountName, 80),
      instructions: clean(input.payTo.instructions, 600),
    };
  }
  if (input.supportWhatsapp != null) next.supportWhatsapp = String(input.supportWhatsapp).replace(/[^\d]/g, '').slice(0, 15);
  if (Array.isArray(input.plans)) {
    const byKey = new Map(current.plans.map((p) => [p.key, p]));
    next.plans = input.plans
      .filter((p) => p && byKey.has(p.key))
      .map((p) => ({
        ...byKey.get(p.key),
        price: Math.max(0, Math.round(Number(p.price) || 0)),
        staffLimit: p.staffLimit === null || p.staffLimit === '' ? null : Math.max(1, Math.round(Number(p.staffLimit) || 1)),
      }));
    if (!next.plans.length) next.plans = current.plans;
  }

  const { PlatformSetting } = getModels();
  const { plans, trialDays, graceDays, payTo, supportWhatsapp } = next;
  await PlatformSetting.upsert({ key: 'billing', value: { plans, trialDays, graceDays, payTo, supportWhatsapp } });
  cache = null;
  return getBillingConfig({ fresh: true });
}

function findPlan(config, key) {
  return config.plans.find((p) => p.key === key) || null;
}

function computeStatus(shop, config, now = new Date()) {
  const trialEndsAt = shop.trialEndsAt ? new Date(shop.trialEndsAt) : null;
  const paidUntil = shop.paidUntil ? new Date(shop.paidUntil) : null;
  const graceMs = (config.graceDays || 0) * DAY;

  // The shop is covered until the later of its trial end and paid-up date.
  const coveredUntil = [trialEndsAt, paidUntil].filter(Boolean).sort((a, b) => b - a)[0] || null;
  const paidCovers = paidUntil && paidUntil > now;
  const trialCovers = trialEndsAt && trialEndsAt > now;

  let state;
  if (paidCovers) state = 'active';
  else if (trialCovers) state = 'trial';
  else if (coveredUntil && now - coveredUntil < graceMs) state = 'past_due';
  else if (!coveredUntil) state = 'trial'; // legacy row with no dates yet; the migration fills them
  else state = 'expired';

  const endsAt = state === 'active' ? paidUntil : state === 'trial' ? trialEndsAt : coveredUntil;
  const daysLeft = endsAt ? Math.ceil((endsAt - now) / DAY) : null;
  const graceEndsAt = coveredUntil ? new Date(coveredUntil.getTime() + graceMs) : null;

  return {
    state,
    plan: shop.plan || null,
    trialEndsAt,
    paidUntil,
    endsAt,
    daysLeft,
    graceEndsAt: state === 'past_due' ? graceEndsAt : null,
    readOnly: state === 'expired',
  };
}

// The period a new payment covers: it starts when current cover ends (so
// paying early never loses trial or paid days) and runs for `months`.
function nextPeriod(shop, months, now = new Date()) {
  const starts = [now, shop.trialEndsAt && new Date(shop.trialEndsAt), shop.paidUntil && new Date(shop.paidUntil)].filter(Boolean);
  const start = new Date(Math.max(...starts.map((d) => d.getTime())));
  const end = new Date(start);
  end.setMonth(end.getMonth() + Math.max(1, Number(months) || 1));
  return { start, end };
}

// Short-lived per-shop status cache for the write guard in auth middleware.
const statusCache = new Map();
const STATUS_TTL = 60000;

async function getShopStatus(shopId) {
  const hit = statusCache.get(shopId);
  if (hit && Date.now() - hit.at < STATUS_TTL) return hit.status;
  const { Shop } = getModels();
  const shop = Shop ? await Shop.findByPk(shopId, { attributes: ['id', 'plan', 'trialEndsAt', 'paidUntil', 'isActive'] }) : null;
  if (!shop) return null;
  const status = computeStatus(shop, await getBillingConfig());
  status.disabled = shop.isActive === false;
  statusCache.set(shopId, { status, at: Date.now() });
  return status;
}

function invalidateShopStatus(shopId) {
  if (shopId == null) statusCache.clear();
  else statusCache.delete(Number(shopId));
}

// Staff logins: every account in the shop except the owner (the first admin).
// Unlimited during the free trial; otherwise the shop's own limit set by the
// platform owner, else the plan's. null = unlimited.
async function staffUsage(shop, config) {
  const cfg = config || (await getBillingConfig());
  const { User } = getModels();
  const status = computeStatus(shop, cfg);
  const total = await User.count({ where: { shopId: shop.id } });
  const used = Math.max(0, total - 1);
  const plan = findPlan(cfg, shop.plan);
  let limit = null;
  let source = 'trial';
  if (shop.staffLimitOverride != null) {
    limit = Number(shop.staffLimitOverride);
    source = 'custom';
  } else if (status.state !== 'trial') {
    limit = plan ? (plan.staffLimit == null ? null : Number(plan.staffLimit)) : null;
    source = 'plan';
  }
  return { used, limit, source, planName: plan?.name || null, canAdd: limit == null || used < limit };
}

// Ugandan numbers typed as 07XX... become 2567XX... for wa.me links.
function toWhatsappNumber(raw) {
  let digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = `256${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith('7')) digits = `256${digits}`;
  return digits;
}

module.exports = {
  DEFAULT_CONFIG,
  getBillingConfig,
  saveBillingConfig,
  findPlan,
  computeStatus,
  nextPeriod,
  getShopStatus,
  invalidateShopStatus,
  toWhatsappNumber,
  staffUsage,
};
