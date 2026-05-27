import { Router } from 'express';
import {
  createShare,
  getShareStatus,
  getShareLogs,
  cancelShare,
  getAllShares
} from '../controllers/shareController';
import { authenticateToken } from '../middleware/auth';
import { shareValidation, paginationValidation, validateRequest } from '../middleware/validation';

const router = Router();

router.use(authenticateToken);

router.post('/create', shareValidation, validateRequest, createShare);
router.get('/', paginationValidation, validateRequest, getAllShares);
router.get('/:jobId', getShareStatus);
router.get('/:jobId/logs', paginationValidation, validateRequest, getShareLogs);
router.post('/:jobId/cancel', cancelShare);

export default router;