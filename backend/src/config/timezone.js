// The business day ("today's sales", day closing, reports) follows the
// shops' local time, not the server's. Railway servers run on UTC, which
// made Uganda's day start at 3 a.m. Set APP_TIMEZONE to change it.
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Africa/Kampala';

// Node reads TZ on every date calculation, so setting it here (before any
// dates are made) moves the whole process to local time.
process.env.TZ = APP_TIMEZONE;

// YYYY-MM-DD of a moment in local time (toISOString() would give the UTC
// date, i.e. yesterday between midnight and 3 a.m. in East Africa).
function localDateString(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "2026-10-23" -> local midnight of that day. new Date("2026-10-23") would be
// UTC midnight instead.
function parseLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

module.exports = { APP_TIMEZONE, localDateString, parseLocalDate };
