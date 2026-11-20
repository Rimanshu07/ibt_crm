import { Router } from 'express';
import { ah } from '../../core/http.js';
import { orgUser } from '../../core/auth.js';
import * as C from './tasks.controller.js';

const router = Router();
router.use(...orgUser);
router.get('/', ah(C.list));
router.post('/', ah(C.create));
router.post('/:id/done', ah(C.toggle));
router.delete('/:id', ah(C.remove));
export default router;
