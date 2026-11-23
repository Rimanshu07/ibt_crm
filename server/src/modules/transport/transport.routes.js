import { Router } from 'express';
import { ah } from '../../core/http.js';
import { orgUser, requireFeature, requirePermission } from '../../core/auth.js';
import * as C from './transport.controller.js';

const router = Router();
router.use(...orgUser, requireFeature('transport'));
const edit = requirePermission('masters.manage');
router.get('/', ah(C.list));
router.get('/locations', ah(C.locations));
router.get('/route', ah(C.getRoute));
router.post('/route', edit, ah(C.saveRoute));
router.post('/', edit, ah(C.save));
router.get('/:id', ah(C.get));
router.put('/:id', edit, ah(C.save));
router.put('/:id/active', edit, ah(C.setActive));
export default router;
