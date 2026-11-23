import { Router } from 'express';
import { ah } from '../../core/http.js';
import { orgUser, requirePermission } from '../../core/auth.js';
import * as C from './rates.controller.js';

/** /rates/:service  (hotel | transport | activity) */
const router = Router();
router.use(...orgUser);
router.get('/:service', ah(C.list));
router.get('/:service/template', ah(C.template));
router.get('/:service/uploads', ah(C.uploads));
router.post('/:service/upload', requirePermission('masters.import', 'masters.manage'), ah(C.doUpload));
router.post('/:service/calculate', ah(C.calculate));
router.post('/:service/breakdown', ah(C.breakdown));
router.post('/:service/manual', requirePermission('masters.manage'), ah(C.manual));
router.put('/:service/:id', requirePermission('masters.manage'), ah(C.updateRate));
router.delete('/:service', requirePermission('masters.manage'), ah(C.remove));
export default router;
