const BASE = '/api/v1';
const TOKEN_KEY = 'ibt_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

/** Error thrown by api(): .code, .status and .fields (per-field messages). */
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Something went wrong');
    this.status = status;
    this.code = body?.error?.code;
    this.fields = body?.error?.fields || {};
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null);
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    }
    throw new ApiError(res.status, data);
  }
  return data;
}

/** Query string from an object, skipping empty values. */
export const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** Authenticated file download (CSV exports, templates). */
export async function download(path, filename) {
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const readText = (file) => new Promise((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsText(file);
});
export const readDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file);
});

/** Money in the organisation's currency, Indian grouping for INR. */
export function money(value, currency = 'INR', digits = 0) {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(Number(value) || 0);
  } catch {
    return `${currency} ${Number(value || 0).toFixed(digits)}`;
  }
}

const toDate = (d) => new Date(String(d).length <= 10 ? `${d}T00:00:00` : String(d).replace(' ', 'T'));
export const fmtDate = (d) => (d ? toDate(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtShort = (d) => (d ? toDate(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—');
export const fmtDay = (d) => (d ? toDate(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—');
export const fmtDateTime = (d) => (d ? toDate(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const ago = (d) => {
  if (!d) return '';
  const s = Math.round((orgNow().getTime() - toDate(d).getTime()) / 1000);
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

/* ---- Organisation clock: dates and "today" follow the organisation's timezone, not the browser's ---- */
let ORG_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const setOrgTimezone = (tz) => { try { if (tz) { new Intl.DateTimeFormat('en', { timeZone: tz }); ORG_TZ = tz; } } catch { /* keep browser tz */ } };
export const orgTimezone = () => ORG_TZ;
export const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: ORG_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
/** Now as a wall-clock Date in the organisation's timezone (server times are stored in the org's timezone). */
const orgNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: ORG_TZ }));
export const addDaysIso = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + Number(n || 0)); return d.toISOString().slice(0, 10); };
export const paxText = (adults, children = [], infants = 0) => [adults && `${adults} Adult${adults > 1 ? 's' : ''}`, children?.length && `${children.length} Child${children.length > 1 ? 'ren' : ''} (${children.join(', ')}y)`, infants && `${infants} Infant${infants > 1 ? 's' : ''}`].filter(Boolean).join(', ');
