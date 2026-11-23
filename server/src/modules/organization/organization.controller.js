import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ApiError, validate, notFound, badRequest, zText } from '../../core/http.js';
import { audit, orgBilling } from '../../core/tenancy.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { TEMPLATES, templateDef } from '../../../../shared/templates.js';
import { PAYMENT_EVENTS, SUPPLIER_SERVICES } from '../../../../shared/catalog.js';
import { describePref } from '../../../../shared/pricing.js';
import * as M from './organization.model.js';

/* ------------------------------ Profile ------------------------------ */
export async function getProfile(req, res) { res.json({ data: await M.profile(req.orgId) }); }

export async function saveProfile(req, res) {
  const b = validate(z.object({
    name: z.string().trim().min(2, 'Company name is required').max(150), legal_name: zText(200), phone: zText(30),
    country_code: z.string().length(2), city: zText(100), state: zText(100), pincode: zText(20), address: zText(255),
    tax_id: zText(50), pan: zText(20), website: zText(150), base_currency: z.string().length(3), timezone: z.string().min(3).max(60).refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Choose a valid timezone'),
    default_tax_rate: z.coerce.number().min(0).max(100), brand_prefix: zText(10),
  }), req.body);
  await M.updateProfile(req.orgId, b);
  await audit(req, 'org.profile_updated', 'organization', req.orgId);
  res.json({ message: 'Organisation details saved' });
}

const image = z.string().max(3_000_000, 'Image is too large (max 2 MB)').optional().default('');
export async function saveBranding(req, res) {
  const b = validate(z.object({
    logo_url: image, header_image: image, footer_image: image,
    branding: z.object({
      primary_color: z.string().max(20).default('#2563eb'),
      header: z.object({ mode: z.enum(['text', 'image']).default('text'), title: zText(150), subtitle: zText(300), align: z.enum(['left', 'center', 'right']).default('left'), show_logo: z.boolean().default(true), show_contact: z.boolean().default(true) }).default({}),
      footer: z.object({ mode: z.enum(['text', 'image']).default('text'), text: zText(1000), show_page_no: z.boolean().default(true) }).default({}),
    }).default({}),
  }), req.body);
  await M.updateBranding(req.orgId, b);
  res.json({ message: 'Header, footer and logo saved. They now appear on quotes, vouchers and invoices.' });
}

export async function features(req, res) { res.json({ data: await M.features(req.orgId) }); }
export async function billing(req, res) { res.json({ data: await orgBilling(req.orgId) }); }
export async function staff(req, res) { res.json({ data: await M.staff(req.orgId) }); }

/* ------------------- Offices, bank accounts, prefs, content ------------------- */
const bool = z.boolean().optional().default(false);
const SCHEMAS = {
  offices: z.object({
    name: z.string().trim().min(2, 'Office name is required').max(120), address: zText(500), city: zText(100), state: zText(100),
    country: zText(100), pincode: zText(20), phone: zText(40), email: zText(150), tax_id: zText(50), is_head: bool,
  }),
  'bank-accounts': z.object({
    kind: z.enum(['bank', 'cash', 'upi', 'card', 'gateway']).default('bank'), name: z.string().trim().min(2, 'Give the account a name').max(120),
    bank_name: zText(120), account_name: zText(150), account_no: zText(60), ifsc: zText(30), swift: zText(30), branch: zText(150), upi_id: zText(100),
    currency: z.string().length(3).default('INR'), opening_balance: z.coerce.number().default(0),
    show_on_docs: z.boolean().default(true), is_default: bool, is_active: z.boolean().default(true),
  }),
  'payment-prefs': z.object({
    kind: z.enum(['supplier', 'customer']), service: z.enum(['all', ...SUPPLIER_SERVICES]).default('all'), is_default: bool,
    parts: z.array(z.object({
      event: z.enum(PAYMENT_EVENTS.map((e) => e.key)), offset_days: z.coerce.number().int().min(-365).max(365), pct: z.coerce.number().positive().max(100),
    })).min(1, 'Add at least one part'),
  }),
  content: z.object({
    kind: z.enum(['inc_exc', 'tnc']), service: z.enum(['general', ...SUPPLIER_SERVICES]).default('general'), title: z.string().trim().min(1, 'Title is required').max(150),
    inclusions: z.array(z.string().trim().max(300)).default([]), exclusions: z.array(z.string().trim().max(300)).default([]), body: zText(20000), is_default: z.boolean().default(true),
  }),
};

const def = (req) => { if (!M.tableDef(req.params.table)) throw notFound('List'); return req.params.table; };

export async function listRows(req, res) {
  const t = def(req);
  res.json({ data: await M.listRows(req.orgId, t, { kind: req.query.kind, service: req.query.service }) });
}

export async function saveRow(req, res) {
  const t = def(req);
  const b = validate(SCHEMAS[t], req.body);
  if (t === 'payment-prefs') {
    const total = b.parts.reduce((s, p) => s + p.pct, 0);
    if (Math.abs(total - 100) > 0.01) throw badRequest(`The parts add up to ${total}%. They must add up to 100%.`, { parts: 'Must total 100%' });
    b.name = describePref(b.parts);
  }
  if (t === 'content') { b.inclusions = b.inclusions.filter(Boolean); b.exclusions = b.exclusions.filter(Boolean); }
  const id = await M.saveRow(req.orgId, t, req.params.id ? Number(req.params.id) : null, b);
  if (!id) throw notFound();
  res.status(req.params.id ? 200 : 201).json({ data: { id }, message: 'Saved' });
}

export async function deleteRow(req, res) {
  await M.deleteRow(req.orgId, def(req), Number(req.params.id));
  res.json({ message: 'Deleted' });
}

/* ------------------------------ Templates ----------------------------- */
export async function templates(req, res) {
  const saved = await M.templates(req.orgId);
  res.json({ data: TEMPLATES.map((t) => {
    const s = saved.find((x) => x.tkey === t.key);
    const settings = typeof s?.settings === 'string' ? JSON.parse(s.settings) : s?.settings;
    return { ...t, subject: s?.subject ?? t.subject, body: s?.body ?? t.body, settings: { ...t.settings, ...(settings || {}) }, customised: Boolean(s), updated_at: s?.updated_at || null };
  }) });
}

export async function saveTemplate(req, res) {
  if (!templateDef(req.params.key)) throw notFound('Template');
  const b = validate(z.object({ subject: zText(255), body: z.string().max(100000).default(''), settings: z.record(z.string(), z.any()).default({}) }), req.body);
  await M.saveTemplate(req.orgId, req.params.key, b, req.user.id);
  res.json({ message: 'Template saved' });
}

export async function resetTemplate(req, res) {
  await M.resetTemplate(req.orgId, req.params.key);
  res.json({ message: 'Template reset to default' });
}

/* -------------------------------- Users ------------------------------- */
export async function users(req, res) { res.json({ data: await M.users(req.orgId) }); }

const userSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120), email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: zText(30), designation: zText(80), password: z.string().min(8, 'At least 8 characters').optional().or(z.literal('')),
  role_ids: z.array(z.coerce.number().int()).min(1, 'Choose at least one role'), status: z.enum(['active', 'inactive']).default('active'),
});

async function checkSeat(orgId) {
  const b = await orgBilling(orgId);
  if (b?.max_users && b.active_users >= b.max_users) throw new ApiError(403, 'LIMIT_REACHED', `Your plan allows ${b.max_users} active users. Contact us to upgrade.`);
}

export async function saveUser(req, res) {
  const b = validate(userSchema, req.body);
  const id = req.params.id ? Number(req.params.id) : null;
  const existing = id ? await M.userById(req.orgId, id) : null;
  if (id && !existing) throw notFound('User');
  if (!id && !b.password) throw badRequest('Set a starting password', { password: 'Required' });
  if (await M.emailUsedBy(b.email, id || 0)) throw new ApiError(409, 'VALIDATION', 'Email already in use', { email: 'Already in use' });
  if (existing?.is_org_owner && b.status !== 'active') throw badRequest('The account owner cannot be deactivated');
  if (!(await M.roleIdsValid(req.orgId, b.role_ids))) throw badRequest('Unknown role', { role_ids: 'Unknown role' });
  if (b.status === 'active' && (!existing || existing.status !== 'active')) await checkSeat(req.orgId);
  const uid = await M.saveUser(req.orgId, id, b, b.password ? await bcrypt.hash(b.password, 12) : null);
  await audit(req, id ? 'user.updated' : 'user.created', 'user', uid, { email: b.email });
  res.status(id ? 200 : 201).json({ data: { id: uid }, message: id ? 'User saved' : `${b.name} can now log in with ${b.email}` });
}

/* -------------------------------- Roles ------------------------------- */
export async function permissions(req, res) {
  const enabled = new Set(req.features);
  res.json({ data: PERMISSIONS.filter((p) => !p.feature || enabled.has(p.feature)) });
}
export async function roles(req, res) { res.json({ data: await M.roles(req.orgId) }); }

const validCodes = new Set(PERMISSIONS.map((p) => p.code));
export async function saveRole(req, res) {
  const b = validate(z.object({
    name: z.string().trim().min(2, 'Role name is required').max(80), description: zText(255),
    scope: z.enum(['own', 'team', 'all']), permissions: z.array(z.string()),
  }), req.body);
  const id = req.params.id ? Number(req.params.id) : null;
  if (id && !(await M.roleById(req.orgId, id))) throw notFound('Role');
  if (await M.roleByName(req.orgId, b.name, id || 0)) throw new ApiError(409, 'VALIDATION', 'A role with this name exists', { name: 'Already exists' });
  await M.saveRole(req.orgId, id, b, b.permissions.filter((p) => validCodes.has(p)));
  res.status(id ? 200 : 201).json({ message: id ? 'Role saved' : 'Role created' });
}
export async function deleteRole(req, res) {
  const role = await M.roleById(req.orgId, Number(req.params.id));
  if (!role) throw notFound('Role');
  if (role.name === 'Admin') throw badRequest('The Admin role cannot be deleted');
  if (Number(role.user_count) > 0) throw badRequest('Remove this role from its users first');
  await M.deleteRole(role.id);
  res.json({ message: 'Role deleted' });
}

/* -------------------------------- Taxes ------------------------------- */
export async function taxes(req, res) { res.json({ data: await M.taxes(req.orgId) }); }
export async function saveTax(req, res) {
  const b = validate(z.object({ name: z.string().trim().min(1, 'Name is required').max(60), rate: z.coerce.number().min(0).max(100), is_default: z.boolean().default(false) }), req.body);
  await M.saveTax(req.orgId, req.params.id ? Number(req.params.id) : null, b);
  res.json({ message: 'Tax saved' });
}
export async function deleteTax(req, res) { await M.deleteTax(req.orgId, Number(req.params.id)); res.json({ message: 'Tax removed' }); }
