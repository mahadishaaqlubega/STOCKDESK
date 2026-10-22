// Currencies with no minor unit in everyday use (ISO 4217 exponent 0).
// UGX amounts are never written with cents, so "UGX 30,000" not "UGX 30,000.00".
const ZERO_DECIMAL_CURRENCIES = new Set([
  'UGX', 'RWF', 'BIF', 'GNF', 'KMF', 'DJF', 'XOF', 'XAF', 'XPF',
  'JPY', 'KRW', 'VND', 'CLP', 'PYG', 'ISK', 'VUV',
]);

export function currencyDecimals(currency) {
  return ZERO_DECIMAL_CURRENCIES.has(String(currency || '').toUpperCase()) ? 0 : 2;
}

// Amount without the currency label (for table columns that state the
// currency once), still using that currency's decimal rules.
export function formatAmount(currency, value) {
  const decimals = currencyDecimals(currency);
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatMoney(currency, value) {
  const decimals = currencyDecimals(currency);
  const amount = Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return currency ? `${currency} ${amount}` : amount;
}

// Short form for tight spaces such as stat tiles: "UGX 5.83M", "USD 12.4K".
// Amounts under 100,000 are shown in full.
export function formatCompactMoney(currency, value) {
  const number = Number(value || 0);
  if (Math.abs(number) < 100000) return formatMoney(currency, number);
  const amount = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 }).format(number);
  return currency ? `${currency} ${amount}` : amount;
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}
