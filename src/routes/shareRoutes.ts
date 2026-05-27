import { Router } from 'express';
import { shareService } from '../services/shareService';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.post('/create', async (req: AuthRequest, res) => {
  try {
    const { link, totalShares } = req.body;
    
    if (!link || !totalShares || totalShares > 500) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }
    
    const job = await shareService.startSharing(req.userId!, link, parseInt(totalShares));
    res.json({ success: true, data: job });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create share job' });
  }
});

router.get('/', async (req: AuthRequest, res) => {
  const jobs = shareService.getAllJobs(req.userId);
  res.json({ success: true, data: jobs });
});

router.get('/:jobId', async (req: AuthRequest, res) => {
  const job = shareService.getJob(req.params.jobId);
  if (!job || job.userId !== req.userId) {
    return res.status(404).json({ success: false, message: 'Job not found' });
  }
  res.json({ success: true, data: job });
});

router.get('/:jobId/logs', async (req: AuthRequest, res) => {
  const job = shareService.getJob(req.params.jobId);
  if (!job || job.userId !== req.userId) {
    return res.status(404).json({ success: false, message: 'Job not found' });
  }
  const limit = parseInt(req.query.limit as string) || 100;
  const logs = shareService.getJobLogs(req.params.jobId, limit);
  res.json({ success: true, data: logs });
});

router.post('/:jobId/cancel', async (req: AuthRequest, res) => {
  const job = shareService.getJob(req.params.jobId);
  if (!job || job.userId !== req.userId) {
    return res.status(404).json({ success: false, message: 'Job not found' });
  }
  
  const cancelled = shareService.cancelJob(req.params.jobId);
  if (cancelled) {
    res.json({ success: true, message: 'Job cancelled' });
  } else {
    res.status(400).json({ success: false, message: 'Cannot cancel job' });
  }
});

export default router;