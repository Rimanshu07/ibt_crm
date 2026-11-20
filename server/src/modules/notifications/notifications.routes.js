import { Router } from 'express';
import { ah } from '../../core/http.js';
import { authenticate } from '../../core/auth.js';
import * as C from './notifications.controller.js';

const router = Router();
router.use(authenticate);
router.get('/', ah(C.list));
router.get('/count', ah(C.count));
router.post('/read-all', ah(C.readAll));
router.post('/:id/read', ah(C.read));
export default router;
