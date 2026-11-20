import { Router } from 'express';
import { ah } from '../../core/http.js';
import { orgUser, requireFeature, requirePermission } from '../../core/auth.js';
import * as C from './hotels.controller.js';

const router = Router();
router.use(...orgUser, requireFeature('hotel'));
const edit = requirePermission('masters.manage');
router.get('/', ah(C.list));
router.get('/meta', ah(C.meta));
router.post('/merge', edit, ah(C.merge));
router.post('/', edit, ah(C.save));
router.get('/:id', ah(C.get));
router.put('/:id', edit, ah(C.save));
router.put('/:id/active', edit, ah(C.setActive));
router.put('/:id/notes', edit, ah(C.saveNotes));
router.put('/:id/closures', edit, ah(C.saveClosures));
export default router;
