import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ApiError, validate, zText } from '../../core/http.js';
import { signToken } from '../../core/auth.js';
import { audit, orgFeatures, userPermissions, orgBilling } from '../../core/tenancy.js';
import { PERMISSIONS } from '../../config/permissions.js';
import * as M from './auth.model.js';

const password = z.string().min(8, 'At least 8 characters').regex(/[A-Za-z]/, 'Include a letter').regex(/[0-9]/, 'Include a number');

const registerSchema = z.object({
  org: z.object({
    name: z.string().trim().min(2, 'Company name is required').max(150),
    email: z.string().trim().toLowerCase().email('Enter a valid email'),
    phone: z.string().trim().min(6, 'Enter a phone number').max(30),
    country_code: z.string().length(2, 'Choose a country'),
    city: zText(100), address: zText(255), tax_id: zText(50),
    base_currency: z.string().length(3, 'Choose a currency'),
    timezone: z.string().min(3).max(60),
    plan_id: z.coerce.number().int().positive().optional(),
  }),
  owner: z.object({
    name: z.string().trim().min(2, 'Your name is required').max(120),
    email: z.string().trim().toLowerCase().email('Enter a valid email'),
    phone: zText(30),
    password,
  }),
});

export async function register(req, res) {
  const { org, owner } = validate(registerSchema, req.body);
  if (await M.orgEmailTaken(org.email)) throw new ApiError(409, 'VALIDATION', 'An organisation with this email already exists', { 'org.email': 'Already registered' });
  if (await M.findUserByEmail(owner.email)) throw new ApiError(409, 'VALIDATION', 'This login email is already in use', { 'owner.email': 'Already in use' });
  if (!(await M.countryExists(org.country_code))) throw new ApiError(400, 'VALIDATION', 'Unknown country', { 'org.country_code': 'Choose a country' });
  const orgId = await M.createOrgWithOwner(org, owner, await bcrypt.hash(owner.password, 12));
  await audit({ user: { org_id: orgId } }, 'org.registered', 'organization', orgId, { name: org.name });
  res.status(201).json({ data: { org_id: orgId }, message: 'Thank you for registering. Our team will verify your details and activate your account shortly.' });
}

export async function login(req, res) {
  const { email, password: pw } = validate(z.object({
    email: z.string().trim().toLowerCase().email('Enter a valid email'), password: z.string().min(1, 'Enter your password'),
  }), req.body);
  const user = await M.findUserByEmail(email);
  if (!user || !(await bcrypt.compare(pw, user.password_hash))) throw new ApiError(401, 'BAD_LOGIN', 'Email or password is incorrect');
  if (user.status !== 'active') throw new ApiError(403, 'USER_INACTIVE', 'Your user account is inactive. Contact your admin.');
  if (!user.is_super_admin) {
    const org = await M.orgStatus(user.org_id);
    const messages = {
      pending: 'Your organisation is waiting for verification. You will receive access once it is approved.',
      rejected: `Your registration was not approved${org?.status_reason ? `: ${org.status_reason}` : ''}.`,
      suspended: `Your organisation is suspended${org?.status_reason ? `: ${org.status_reason}` : ''}. Please contact support.`,
    };
    if (!org || org.status !== 'active') throw new ApiError(403, `ORG_${(org?.status || 'missing').toUpperCase()}`, messages[org?.status] || 'Organisation not found');
  }
  await M.touchLogin(user.id);
  res.json({ data: { token: signToken(user) } });
}

export async function me(req, res) {
  const u = req.user;
  const unread = await M.unreadCount(u.id);
  if (u.is_super_admin) return res.json({ data: { user: u, role: 'super_admin', org: null, features: [], permissions: [], unread } });
  const features = await orgFeatures(u.org_id);
  const enabled = new Set(features);
  const permissions = u.is_org_owner
    ? PERMISSIONS.filter((p) => !p.feature || enabled.has(p.feature)).map((p) => p.code)
    : await userPermissions(u.id, features);
  res.json({ data: {
    user: u, role: 'org_user', roles: await M.userRoles(u.id), org: await M.meOrg(u.org_id),
    features, permissions, billing: await orgBilling(u.org_id), unread,
  } });
}

export async function updateProfile(req, res) {
  const b = validate(z.object({ name: z.string().trim().min(2, 'Name is required').max(120), phone: zText(30), designation: zText(80) }), req.body);
  await M.updateProfile(req.user.id, b);
  res.json({ message: 'Profile saved' });
}

export async function changePassword(req, res) {
  const b = validate(z.object({ current: z.string().min(1, 'Enter your current password'), next: password }), req.body);
  const row = await M.findUserById(req.user.id);
  if (!(await bcrypt.compare(b.current, row.password_hash))) throw new ApiError(400, 'VALIDATION', 'Current password is incorrect', { current: 'Incorrect' });
  await M.updatePassword(req.user.id, await bcrypt.hash(b.next, 12));
  res.json({ message: 'Password changed' });
}
