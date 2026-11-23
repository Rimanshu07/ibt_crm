import { Router } from 'express';
import { ah } from '../../core/http.js';
import { orgUser, requireFeature, requirePermission } from '../../core/auth.js';
import * as C from './reports.controller.js';

const router = Router();
router.use(...orgUser);
router.get('/dashboard', ah(C.dashboard));
router.get('/live-dues', ah(C.liveDues));
router.get('/sales', requireFeature('sales_reports'), requirePermission('reports.sales'), ah(C.sales));
router.get('/operations', ah(C.operations));
router.get('/check-in-out', requirePermission('reports.sales'), ah(C.checkInOut));
router.get('/quote-diff', requireFeature('quote_booking_diff'), ah(C.quoteDiff));
router.get('/documents/:id', requireFeature('vouchers'), ah(C.documents));
export default router;
