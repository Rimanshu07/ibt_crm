import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, query, transaction } from '../../core/db.js';
import { ApiError, validate, notFound, badRequest, zText } from '../../core/http.js';
import { audit, orgBilling } from '../../core/tenancy.js';
import * as M from './admin.model.js';

export async function dashboard(_req, res) {
  const counts = { pending: 0, active: 0, rejected: 0, suspended: 0 };
  (await M.statusCounts()).forEach((s) => { counts[s.status] = Number(s.n); });
  const revenue = {};
  for (const o of await M.activeOrgIds()) {
    const b = await orgBilling(o.id);
    if (b) revenue[b.currency] = Math.round(((revenue[b.currency] || 0) + b.monthly_total) * 100) / 100;
  }
  res.json({ data: {
    counts, active_users: await M.activeUsers(), new_this_month: await M.newThisMonth(), monthly_revenue: revenue,
    pending: await M.pendingOrgs(), signups: await M.signups(), totals: await M.platformTotals(), top_orgs: await M.topOrgs(), trials_ending: await M.trialsEnding(),
  } });
}

export async function orgs(req, res) { res.json({ data: await M.orgs(req.query) }); }

export async function org(req, res) {
  const o = await M.org(Number(req.params.id));
  if (!o) throw notFound('Organisation');
  delete o.header_image; delete o.footer_image;
  res.json({ data: {
    org: o, users: await M.orgUsers(o.id), features: await M.orgFeatureList(o.id), billing: await orgBilling(o.id),
    usage: await M.orgUsage(o.id), notes: await M.orgNotes(o.id), invoices: await M.invoices({ org_id: o.id }), audit: await M.orgAudit(o.id),
  } });
}

export async function approve(req, res) {
  const body = validate(z.object({ plan_id: z.coerce.number().int().positive(), trial_days: z.coerce.number().int().min(0).max(365).optional() }), req.body);
  const o = await one('SELECT * FROM organizations WHERE id = ?', [req.params.id]);
  if (!o) throw notFound('Organisation');
  if (o.status === 'active') throw badRequest('Already active');
  const plan = await one('SELECT * FROM plans WHERE id = ?', [body.plan_id]);
  if (!plan) throw badRequest('Choose a plan', { plan_id: 'Choose a plan' });
  const trialDays = body.trial_days ?? plan.trial_days;
  await transaction(async (c) => {
    await c.execute(`UPDATE organizations SET status='active', status_reason=NULL, plan_id=?, approved_at=NOW(), approved_by=?,
       trial_ends_at = IF(? > 0, DATE_ADD(CURDATE(), INTERVAL ? DAY), NULL) WHERE id=?`, [plan.id, req.user.id, trialDays, trialDays, o.id]);
    await M.applyPlanFeatures(c, o.id, plan.id, req.user.id);
    await M.seedOrganisation(c, o);
  });
  await audit(req, 'org.approved', 'organization', o.id, { plan: plan.name, trial_days: trialDays });
  res.json({ message: `${o.name} is now active on the ${plan.name} plan` });
}

export const setStatus = (status, label) => async (req, res) => {
  const { reason } = validate(z.object({ reason: zText(255) }), req.body);
  const r = await query('UPDATE organizations SET status=?, status_reason=? WHERE id=?', [status, reason || null, req.params.id]);
  if (!r.affectedRows) throw notFound('Organisation');
  await audit(req, `org.${label}`, 'organization', req.params.id, { reason });
  res.json({ message: `Organisation ${label}` });
};

export async function reactivate(req, res) {
  const o = await one('SELECT id, plan_id FROM organizations WHERE id = ?', [req.params.id]);
  if (!o) throw notFound('Organisation');
  if (!o.plan_id) throw badRequest('Approve the organisation with a plan first');
  await query("UPDATE organizations SET status='active', status_reason=NULL WHERE id=?", [o.id]);
  await audit(req, 'org.reactivated', 'organization', o.id);
  res.json({ message: 'Organisation reactivated' });
}

export async function updateOrg(req, res) {
  const body = validate(z.object({
    plan_id: z.coerce.number().int().positive().optional(),
    org_fee_override: z.union([z.coerce.number().min(0), z.null()]).optional(),
    user_fee_override: z.union([z.coerce.number().min(0), z.null()]).optional(),
    trial_ends_at: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
    apply_plan_features: z.boolean().optional(),
  }), req.body);
  const o = await one('SELECT id FROM organizations WHERE id = ?', [req.params.id]);
  if (!o) throw notFound('Organisation');
  const sets = []; const params = [];
  for (const key of ['plan_id', 'org_fee_override', 'user_fee_override', 'trial_ends_at']) if (key in body) { sets.push(`${key} = ?`); params.push(body[key]); }
  await transaction(async (c) => {
    if (sets.length) await c.execute(`UPDATE organizations SET ${sets.join(', ')} WHERE id = ?`, [...params, o.id]);
    if (body.apply_plan_features && body.plan_id) await M.applyPlanFeatures(c, o.id, body.plan_id, req.user.id);
  });
  await audit(req, 'org.updated', 'organization', o.id, body);
  res.json({ message: 'Saved', data: { billing: await orgBilling(o.id) } });
}

async function setFeatures(orgId, features, adminId) {
  const known = new Set((await query('SELECT code FROM features')).map((f) => f.code));
  for (const [code, enabled] of Object.entries(features)) {
    if (!known.has(code)) continue;
    await query(`INSERT INTO org_features (org_id, feature_code, enabled, updated_by) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_by = VALUES(updated_by)`, [orgId, code, enabled ? 1 : 0, adminId]);
  }
}

export async function orgFeatures(req, res) {
  const { features } = validate(z.object({ features: z.record(z.string(), z.boolean()) }), req.body);
  if (!(await one('SELECT id FROM organizations WHERE id = ?', [req.params.id]))) throw notFound('Organisation');
  await setFeatures(Number(req.params.id), features, req.user.id);
  await audit(req, 'org.features_changed', 'organization', req.params.id, features);
  res.json({ message: 'Features updated' });
}

export async function bulkFeatures(req, res) {
  const b = validate(z.object({ org_ids: z.array(z.coerce.number().int()).min(1), features: z.record(z.string(), z.boolean()) }), req.body);
  for (const id of b.org_ids) await setFeatures(id, b.features, req.user.id);
  await audit(req, 'features.bulk', 'organization', b.org_ids.join(','), b.features);
  res.json({ message: `Updated ${b.org_ids.length} organisations` });
}

export async function addNote(req, res) {
  const { body } = validate(z.object({ body: z.string().trim().min(1, 'Write a note').max(2000) }), req.body);
  await M.addNote(Number(req.params.id), req.user.id, body);
  res.status(201).json({ message: 'Note added' });
}

export async function features(_req, res) { res.json({ data: await M.features() }); }
export async function updateFeature(req, res) {
  const b = validate(z.object({ name: z.string().trim().min(2).max(100), description: zText(255), module: z.string().trim().min(2).max(50) }), req.body);
  await query('UPDATE features SET name = ?, description = ?, module = ? WHERE code = ?', [b.name, b.description, b.module, req.params.code]);
  res.json({ message: 'Feature saved' });
}

export async function plans(_req, res) { res.json({ data: await M.plans() }); }
const planSchema = z.object({
  name: z.string().trim().min(2).max(80), description: zText(255), currency: z.string().length(3),
  org_fee_monthly: z.coerce.number().min(0), user_fee_monthly: z.coerce.number().min(0),
  max_users: z.union([z.coerce.number().int().positive(), z.null()]).optional().default(null),
  trial_days: z.coerce.number().int().min(0).max(365).default(14), is_active: z.boolean().default(true), features: z.array(z.string()).default([]),
});
export async function savePlan(req, res) {
  const b = validate(planSchema, req.body);
  const vals = [b.name, b.description, b.currency, b.org_fee_monthly, b.user_fee_monthly, b.max_users, b.trial_days, b.is_active ? 1 : 0];
  let id = Number(req.params.id) || null;
  if (id) {
    const r = await query('UPDATE plans SET name=?, description=?, currency=?, org_fee_monthly=?, user_fee_monthly=?, max_users=?, trial_days=?, is_active=? WHERE id=?', [...vals, id]);
    if (!r.affectedRows) throw notFound('Plan');
  } else {
    const r = await query('INSERT INTO plans (name, description, currency, org_fee_monthly, user_fee_monthly, max_users, trial_days, is_active) VALUES (?,?,?,?,?,?,?,?)', vals);
    id = r.insertId;
  }
  await M.savePlanFeatures(id, b.features);
  await audit(req, req.params.id ? 'plan.updated' : 'plan.created', 'plan', id, { name: b.name });
  res.status(req.params.id ? 200 : 201).json({ data: { id }, message: 'Plan saved' });
}

export async function billing(_req, res) {
  const orgsList = await query("SELECT id, name, status, trial_ends_at FROM organizations WHERE status IN ('active','suspended') ORDER BY name");
  const rows = [];
  for (const o of orgsList) rows.push({ ...o, ...(await orgBilling(o.id)) });
  res.json({ data: rows });
}

export async function invoices(req, res) { res.json({ data: await M.invoices(req.query) }); }

/** Create subscription invoices for every active organisation for a month (skips existing). */
export async function generateInvoices(req, res) {
  const { period } = validate(z.object({ period: z.string().regex(/^\d{4}-\d{2}$/, 'Choose a month') }), req.body);
  let made = 0;
  for (const o of await M.activeOrgIds()) {
    const b = await orgBilling(o.id);
    if (!b?.plan_id) continue;
    const r = await query(
      `INSERT IGNORE INTO platform_invoices (org_id, invoice_no, period, plan_name, currency, org_fee, user_fee, users, amount) VALUES (?,?,?,?,?,?,?,?,?)`,
      [o.id, `IBT-${period.replace('-', '')}-${String(o.id).padStart(4, '0')}`, period, b.plan_name, b.currency, b.org_fee, b.user_fee, b.active_users, b.monthly_total]
    );
    made += r.affectedRows;
  }
  await audit(req, 'invoices.generated', 'platform', period, { made });
  res.json({ message: `${made} invoice(s) created for ${period}` });
}

export async function setInvoice(req, res) {
  const b = validate(z.object({ status: z.enum(['due', 'paid', 'void']), payment_ref: zText(100) }), req.body);
  await query('UPDATE platform_invoices SET status = ?, payment_ref = ?, paid_at = IF(? = \'paid\', NOW(), NULL) WHERE id = ?', [b.status, b.payment_ref, b.status, req.params.id]);
  res.json({ message: `Invoice marked ${b.status}` });
}

export async function admins(_req, res) { res.json({ data: await M.superAdmins() }); }
export async function saveAdmin(req, res) {
  const b = validate(z.object({
    name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email(), phone: zText(30),
    password: z.string().min(8, 'At least 8 characters').optional().or(z.literal('')), status: z.enum(['active', 'inactive']).default('active'),
  }), req.body);
  const id = Number(req.params.id) || null;
  if (await one('SELECT id FROM users WHERE email = ? AND id <> ?', [b.email, id || 0])) throw new ApiError(409, 'VALIDATION', 'Email already in use', { email: 'Already in use' });
  if (id === req.user.id && b.status !== 'active') throw badRequest('You cannot deactivate yourself');
  if (id) {
    await query('UPDATE users SET name=?, email=?, phone=?, status=? WHERE id=? AND is_super_admin = 1', [b.name, b.email, b.phone, b.status, id]);
    if (b.password) await query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(b.password, 12), id]);
  } else {
    if (!b.password) throw badRequest('Set a password', { password: 'Required' });
    await query('INSERT INTO users (org_id, is_super_admin, name, email, phone, password_hash, status) VALUES (NULL, 1, ?,?,?,?,?)', [b.name, b.email, b.phone, await bcrypt.hash(b.password, 12), b.status]);
  }
  await audit(req, 'admin.saved', 'user', id, { email: b.email });
  res.json({ message: 'Super admin saved' });
}

export async function auditLog(req, res) {
  const where = []; const params = [];
  if (req.query.org_id) { where.push('a.org_id = ?'); params.push(Number(req.query.org_id)); }
  if (req.query.action) { where.push('a.action LIKE ?'); params.push(`%${req.query.action}%`); }
  res.json({ data: await query(
    `SELECT a.*, u.name AS user_name, o.name AS org_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN organizations o ON o.id = a.org_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.id DESC LIMIT 300`, params
  ) });
}
