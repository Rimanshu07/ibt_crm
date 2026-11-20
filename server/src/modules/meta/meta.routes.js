import { Router } from 'express';
import { query } from '../../core/db.js';
import { ah } from '../../core/http.js';

/** Public lookups used by registration and settings screens. */
const router = Router();
const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Bangkok', 'Asia/Kuala_Lumpur', 'Asia/Colombo', 'Asia/Kathmandu',
  'Asia/Dhaka', 'Asia/Jakarta', 'Asia/Riyadh', 'Asia/Baku', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'America/New_York',
  'America/Chicago', 'America/Los_Angeles', 'America/Toronto', 'Australia/Sydney', 'UTC'];

router.get('/countries', ah(async (_req, res) => res.json({ data: await query('SELECT * FROM countries ORDER BY name') })));
router.get('/currencies', ah(async (_req, res) => res.json({ data: await query('SELECT * FROM currencies ORDER BY code') })));
router.get('/timezones', (_req, res) => res.json({ data: TIMEZONES }));
router.get('/plans', ah(async (_req, res) => res.json({ data: await query(
  'SELECT id, name, description, currency, org_fee_monthly, user_fee_monthly, max_users, trial_days FROM plans WHERE is_active = 1 ORDER BY id'
) })));

export default router;
