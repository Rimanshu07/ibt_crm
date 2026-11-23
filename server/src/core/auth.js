import { setRequestTz } from './context.js';
/** Authentication and authorisation middleware. */
import jwt from 'jsonwebtoken';
import { one } from './db.js';
import { ApiError, ah } from './http.js';
import { orgFeatures, userPermissions } from './tenancy.js';

const SECRET = () => process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(user) {
  return jwt.sign({ sub: user.id, org: user.org_id, sa: user.is_super_admin ? 1 : 0 }, SECRET(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });
}

/** Verifies the Bearer token and loads req.user. */
export const authenticate = ah(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Please log in');
  let payload;
  try { payload = jwt.verify(token, SECRET()); } catch { throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired, please log in again'); }
  const user = await one(
    'SELECT id, org_id, is_super_admin, is_org_owner, name, email, phone, designation, status FROM users WHERE id = ?', [payload.sub]
  );
  if (!user || user.status !== 'active') throw new ApiError(401, 'UNAUTHENTICATED', 'Account not active');
  req.user = user;
  next();
});

export function requireSuperAdmin(req, _res, next) {
  if (!req.user?.is_super_admin) return next(new ApiError(403, 'FORBIDDEN', 'Super Admin only'));
  next();
}

/**
 * Tenant guard: the user must belong to an ACTIVE organisation. The org id always
 * comes from the logged-in user, never from the request.
 */
export const tenant = ah(async (req, _res, next) => {
  if (!req.user?.org_id) throw new ApiError(403, 'FORBIDDEN', 'Organisation users only');
  const org = await one('SELECT id, status, base_currency, brand_prefix, timezone FROM organizations WHERE id = ?', [req.user.org_id]);
  if (!org) throw new ApiError(403, 'FORBIDDEN', 'Organisation not found');
  if (org.status !== 'active') throw new ApiError(403, `ORG_${org.status.toUpperCase()}`, 'Your organisation is not active');
  req.orgId = org.id;
  req.org = org;
  setRequestTz(org.timezone);
  req.features = await orgFeatures(org.id);
  req.permissions = await userPermissions(req.user.id, req.features);
  next();
});

/** Shortcut used by every organisation module. */
export const orgUser = [authenticate, tenant];

export const hasPerm = (req, code) => Boolean(req.user?.is_org_owner || req.permissions?.includes(code));

export const requireFeature = (code) => (req, _res, next) => {
  if (!req.features?.includes(code)) return next(new ApiError(403, 'FEATURE_DISABLED', 'This feature is not enabled for your organisation'));
  next();
};

export const requirePermission = (...codes) => (req, _res, next) => {
  if (codes.some((c) => hasPerm(req, c))) return next();
  next(new ApiError(403, 'FORBIDDEN', 'You do not have permission to do this'));
};
