import { Router } from 'express';
import { ah } from '../../core/http.js';
import { orgUser, requireFeature, requirePermission } from '../../core/auth.js';
import * as C from './trips.controller.js';

const router = Router();
router.use(...orgUser, requireFeature('crm_leads'));
router.get('/', requirePermission('trips.view'), ah(C.list));
router.post('/', requirePermission('trips.create'), ah(C.create));
router.get('/:id', requirePermission('trips.view'), ah(C.get));
router.put('/:id', requirePermission('trips.edit'), ah(C.update));
router.post('/:id/stage', requirePermission('trips.edit'), ah(C.stage));
router.put('/:id/team', requirePermission('trips.assign'), ah(C.team));
router.put('/:id/travel-details', requirePermission('trips.edit'), ah(C.travel));
router.get('/:id/logs', requirePermission('trips.view'), ah(C.logs));
export default router;
