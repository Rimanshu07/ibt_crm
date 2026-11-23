/**
 * Per-request context. The organisation's timezone travels with every request so that
 * "today", NOW() and stored times always follow the organisation's clock (e.g. Asia/Kolkata).
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export const requestContext = new AsyncLocalStorage();
export const DEFAULT_TZ = process.env.APP_TIMEZONE || 'Asia/Kolkata';

export const currentTz = () => requestContext.getStore()?.tz || DEFAULT_TZ;
export function setRequestTz(tz) { const s = requestContext.getStore(); if (s && tz) s.tz = tz; }

const parts = (date, tz) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
}).formatToParts(date).map((p) => [p.type, p.value]));

/** "+05:30" style offset of a timezone right now (what MySQL / MariaDB SET time_zone accepts). */
export function tzOffset(tz = currentTz(), date = new Date()) {
  let p;
  try { p = parts(date, tz); } catch { p = parts(date, DEFAULT_TZ); }
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  const mins = Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const sign = mins < 0 ? '-' : '+'; const a = Math.abs(mins);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/** Today's date (YYYY-MM-DD) in the organisation's timezone. */
export function todayInTz(tz = currentTz()) {
  let p;
  try { p = parts(new Date(), tz); } catch { p = parts(new Date(), DEFAULT_TZ); }
  return `${p.year}-${p.month}-${p.day}`;
}
/** Current date-time "YYYY-MM-DD HH:MM:SS" in the organisation's timezone. */
export function nowInTz(tz = currentTz()) {
  let p;
  try { p = parts(new Date(), tz); } catch { p = parts(new Date(), DEFAULT_TZ); }
  return `${p.year}-${p.month}-${p.day} ${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}:${p.second}`;
}
