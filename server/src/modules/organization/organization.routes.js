import { Router } from 'express';
import { ah } from '../../core/http.js';
import { orgUser, requirePermission } from '../../core/auth.js';
import * as C from './organization.controller.js';

const router = Router();
router.use(...orgUser);
const settings = requirePermission('settings.manage');

router.get('/profile', ah(C.getProfile));
router.put('/profile', settings, ah(C.saveProfile));
router.put('/branding', settings, ah(C.saveBranding));
router.get('/features', ah(C.features));
router.get('/billing', requirePermission('billing.view'), ah(C.billing));
router.get('/staff', ah(C.staff));

router.get('/templates', ah(C.templates));
router.put('/templates/:key', settings, ah(C.saveTemplate));
router.delete('/templates/:key', settings, ah(C.resetTemplate));

router.get('/users', requirePermission('users.manage'), ah(C.users));
router.post('/users', requirePermission('users.manage'), ah(C.saveUser));
router.put('/users/:id', requirePermission('users.manage'), ah(C.saveUser));

router.get('/permissions', requirePermission('roles.manage'), ah(C.permissions));
router.get('/roles', ah(C.roles));
router.post('/roles', requirePermission('roles.manage'), ah(C.saveRole));
router.put('/roles/:id', requirePermission('roles.manage'), ah(C.saveRole));
router.delete('/roles/:id', requirePermission('roles.manage'), ah(C.deleteRole));

router.get('/tax-types', ah(C.taxes));
router.post('/tax-types', settings, ah(C.saveTax));
router.put('/tax-types/:id', settings, ah(C.saveTax));
router.delete('/tax-types/:id', settings, ah(C.deleteTax));

// offices | bank-accounts | payment-prefs | content
router.get('/:table', ah(C.listRows));
router.post('/:table', settings, ah(C.saveRow));
router.put('/:table/:id', settings, ah(C.saveRow));
router.delete('/:table/:id', settings, ah(C.deleteRow));

export default router;
