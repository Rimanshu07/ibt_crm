import { Router } from 'express';
import { ah } from '../../core/http.js';
import { orgUser, requirePermission } from '../../core/auth.js';
import * as C from './suppliers.controller.js';

const router = Router();
router.use(...orgUser);
const edit = requirePermission('suppliers.manage', 'masters.manage');
router.get('/', ah(C.list));
router.get('/export', ah(C.exportCsv));
router.post('/import', requirePermission('masters.import'), ah(C.importCsv));
router.post('/', edit, ah(C.save));
router.get('/:id', ah(C.get));
router.put('/:id', edit, ah(C.save));
router.put('/:id/active', edit, ah(C.setActive));
export default router;
