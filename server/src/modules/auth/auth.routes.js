import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ah } from '../../core/http.js';
import { authenticate } from '../../core/auth.js';
import * as C from './auth.controller.js';

const router = Router();
const limit = (n) => rateLimit({ windowMs: 60_000, limit: n, standardHeaders: true, legacyHeaders: false });

router.post('/register', limit(5), ah(C.register));
router.post('/login', limit(10), ah(C.login));
router.get('/me', authenticate, ah(C.me));
router.put('/profile', authenticate, ah(C.updateProfile));
router.post('/change-password', authenticate, ah(C.changePassword));

export default router;
