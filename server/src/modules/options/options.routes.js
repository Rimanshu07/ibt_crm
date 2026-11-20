import { Router } from 'express';
import { ah } from '../../core/http.js';
import { orgUser, requirePermission } from '../../core/auth.js';
import * as C from './options.controller.js';

const router = Router();
router.use(...orgUser);
router.get('/', ah(C.get));
router.post('/:list', ah(C.add));
router.delete('/:list', requirePermission('masters.manage', 'settings.manage'), ah(C.remove));
export default router;
