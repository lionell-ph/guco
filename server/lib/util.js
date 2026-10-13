const { EMAIL_DOMAIN } = require('./constants');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const httpError = function (status, message) { return new HttpError(status, message); };

/* Lets route handlers be async without try/catch: errors flow to the error middleware. */
const wrap = function (fn) {
  return function (req, res, next) { Promise.resolve(fn(req, res, next)).catch(next); };
};

/* ---------- input cleaning / validation (mirrors the rules the forms already show) ---------- */
function clip(value, max) { return String(value == null ? '' : value).trim().slice(0, max); }
function cleanEmail(value) { return String(value || '').trim().toLowerCase(); }
function isEmail(e) { return e.length <= 190 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function isBpsuEmail(e) { return e.length > EMAIL_DOMAIN.length && e.slice(-EMAIL_DOMAIN.length) === EMAIL_DOMAIN; }
function isStudentId(id) { return /^\d{2}-\d{5}$/.test(String(id || '').trim()); }

/* 09XXXXXXXXX (also accepts +639XXXXXXXXX / 639XXXXXXXXX, spaces and dashes). "" when invalid. */
function cleanMobile(value) {
  let v = String(value || '').replace(/[\s\-()]/g, '');
  if (/^\+639\d{9}$/.test(v)) v = '0' + v.slice(3);
  else if (/^639\d{9}$/.test(v)) v = '0' + v.slice(2);
  return /^09\d{9}$/.test(v) ? v : '';
}

/* At least 8 characters with an uppercase, a lowercase, a number and a special character. */
function passwordOk(pw) {
  pw = String(pw || '');
  return pw.length >= 8 && pw.length <= 200 &&
    /\p{Lu}/u.test(pw) && /\p{Ll}/u.test(pw) && /\p{Nd}/u.test(pw) && /[^\p{L}\p{N}\s]/u.test(pw);
}
const PASSWORD_MESSAGE =
  'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number and a special character (like ! @ # $ ?).';

/* "Last, First M.I. Suffix" - the display name used across GUCO. */
function formatName(f) {
  const last = String(f.lastName || '').trim();
  const first = String(f.firstName || '').trim();
  const middle = String(f.middleName || '').trim();
  const suffix = String(f.suffix || '').trim();
  const mi = middle ? middle.charAt(0).toUpperCase() + '.' : '';
  let out = last;
  if (first) out += (out ? ', ' : '') + first;
  if (mi) out += ' ' + mi;
  if (suffix) out += ' ' + suffix;
  return out;
}

/* Only small raster images are accepted as data URLs (never SVG: it can carry script). */
function isImageDataUrl(v, maxChars) {
  if (typeof v !== 'string' || v.length > maxChars) return false;
  const m = /^data:image\/(jpeg|png|webp);base64,/.exec(v);
  if (!m) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(v.slice(m[0].length));
}

/* Only http(s) links (or "#") may be stored: blocks javascript: URLs in href attributes. */
function safeLink(v, allowHash) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (allowHash && s === '#') return '#';
  if (s.length > 500) return null;
  try {
    const u = new URL(s);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? s : null;
  } catch (e) { return null; }
}

/* ---------- dates (the database stores UTC; the office works in Manila time) ---------- */
function toDate(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  return new Date(String(s).replace(' ', 'T') + 'Z');
}
function manilaDateTime(s) {
  const d = toDate(s);
  return d ? d.toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '';
}
function manilaDate(s) {
  const d = toDate(s);
  return d ? d.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' }) : '';
}
function millis(s) { const d = toDate(s); return d ? d.getTime() : 0; }
function todayManila() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()); }
function isIsoDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

module.exports = {
  HttpError, httpError, wrap,
  clip, cleanEmail, isEmail, isBpsuEmail, isStudentId, cleanMobile,
  passwordOk, PASSWORD_MESSAGE, formatName, isImageDataUrl, safeLink,
  toDate, manilaDateTime, manilaDate, millis, todayManila, isIsoDate
};
