import { Router } from 'express';
import { ah } from '../../core/http.js';
import { orgUser } from '../../core/auth.js';
import * as C from './bookings.controller.js';

const router = Router();
router.use(...orgUser);
router.get('/summary', ah(C.summary));
router.get('/trip/:id', ah(C.byTrip));
router.post('/assign', ah(C.assign));
router.get('/board/:service', ah(C.board));
router.get('/:id', ah(C.get));
router.put('/:id', ah(C.update));
export default router;
