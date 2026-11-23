/** HTTP helpers shared by every module. */
import { z } from 'zod';

/** Error with an HTTP status and a machine-readable code. */
export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const notFound = (what = 'Record') => new ApiError(404, 'NOT_FOUND', `${what} not found`);
export const badRequest = (message, fields) => new ApiError(400, 'VALIDATION', message, fields);

/** Wrap async handlers so thrown errors reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Validate data with a zod schema; throws a 400 with per-field messages. */
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) fields[issue.path.join('.')] = issue.message;
    throw new ApiError(400, 'VALIDATION', Object.values(fields)[0] || 'Please correct the highlighted fields', fields);
  }
  return result.data;
}

/** JSON columns may arrive as strings or already parsed. */
export const j = (v, fallback = null) => {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
/** Today in the organisation's timezone (not the server's). */
export { todayInTz as todayIso, nowInTz } from './context.js';
export const addDays = (date, n) => {
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return d.toISOString().slice(0, 10);
};

/* Common zod pieces */
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date');
export const zOptDate = z.union([zDate, z.literal(''), z.null()]).optional().transform((v) => v || null);
export const zId = z.coerce.number().int().positive();
export const zOptId = z.union([z.literal(''), z.null(), z.coerce.number().int().positive()]).optional().transform((v) => v || null);
/** Optional text: missing, null and '' all become ''. */
export const zText = (max = 255) => z.union([z.null(), z.string().trim().max(max)]).optional().transform((v) => v ?? '');
