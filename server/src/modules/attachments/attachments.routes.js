import { Router } from 'express';
import { ah } from '../../core/http.js';
import { orgUser } from '../../core/auth.js';
import * as C from './attachments.controller.js';

const router = Router();
router.use(...orgUser);
router.get('/', ah(C.list));
router.post('/', ah(C.create));
router.get('/:id/download', ah(C.download));
router.get('/:id/text', ah(C.text));
router.put('/:id', ah(C.update));
router.delete('/:id', ah(C.remove));
export default router;
