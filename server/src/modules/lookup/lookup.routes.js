import { Router } from 'express';
import { ah } from '../../core/http.js';
import { orgUser } from '../../core/auth.js';
import * as C from './lookup.controller.js';

const router = Router();
router.use(...orgUser);
router.get('/:ref', ah(C.search));
router.get('/:ref/:id', ah(C.get));
export default router;
