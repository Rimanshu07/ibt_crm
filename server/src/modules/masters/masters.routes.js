import { Router } from 'express';
import { ah } from '../../core/http.js';
import { orgUser, requirePermission } from '../../core/auth.js';
import * as C from './masters.controller.js';

/** Generic masters: /masters/:type (destination, trip_source, visa_service, land_package, ...) */
const router = Router();
router.use(...orgUser);
const edit = requirePermission('masters.manage');
router.get('/:type', C.typeGuard, ah(C.list));
router.get('/:type/export', C.typeGuard, ah(C.exportCsv));
router.get('/:type/template', C.typeGuard, ah(C.template));
router.post('/:type/import', C.typeGuard, requirePermission('masters.import'), ah(C.importCsv));
router.post('/:type', C.typeGuard, edit, ah(C.save));
router.put('/:type/:id', C.typeGuard, edit, ah(C.save));
router.put('/:type/:id/active', C.typeGuard, edit, ah(C.setActive));
router.delete('/:type/:id', C.typeGuard, edit, ah(C.remove));
export default router;
