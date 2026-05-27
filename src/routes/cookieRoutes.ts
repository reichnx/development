import { Router } from 'express';
import {
  addCookie,
  getCookies,
  updateCookie,
  deleteCookie,
  clearAllCookies,
  getCookieStats
} from '../controllers/cookieController';
import { authenticateToken } from '../middleware/auth';
import { cookieValidation, validateRequest } from '../middleware/validation';

const router = Router();

router.use(authenticateToken);

router.post('/add', cookieValidation, validateRequest, addCookie);
router.get('/', getCookies);
router.put('/:cookieId', updateCookie);
router.delete('/:cookieId', deleteCookie);
router.delete('/clear/all', clearAllCookies);
router.get('/stats', getCookieStats);

export default router;