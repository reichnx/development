import { Router } from 'express';
import { register, login, getProfile, changePassword } from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';
import { loginValidation, validateRequest } from '../middleware/validation';

const router = Router();

router.post('/register', loginValidation, validateRequest, register);
router.post('/login', loginValidation, validateRequest, login);
router.get('/profile', authenticateToken, getProfile);
router.post('/change-password', authenticateToken, changePassword);

export default router;