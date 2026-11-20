import { Router } from 'express';
import { ah } from '../../core/http.js';
import { orgUser, requireFeature, requirePermission } from '../../core/auth.js';
import * as C from './activities.controller.js';

const router = Router();
router.use(...orgUser, requireFeature('activity'));
const edit = requirePermission('masters.manage');
router.get('/', ah(C.list));
router.get('/cities', ah(C.cities));
router.post('/', edit, ah(C.save));
router.get('/:id', ah(C.get));
router.put('/:id', edit, ah(C.save));
router.put('/:id/active', edit, ah(C.setActive));
export default router;
