import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { cookieManager } from '../services/cookieManager';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.post('/add', async (req: AuthRequest, res) => {
  try {
    const { cookie, name, proxy } = req.body;
    
    const newCookie = {
      id: uuidv4(),
      userId: req.userId!,
      cookie,
      name: name || `Cookie-${Date.now()}`,
      status: 'active' as const,
      sharesCount: 0,
      createdAt: new Date(),
      proxy
    };

    cookieManager.addCookie(newCookie);
    res.json({ success: true, message: 'Cookie added successfully', data: newCookie });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add cookie' });
  }
});

router.get('/', async (req: AuthRequest, res) => {
  const allCookies = cookieManager.getAllCookies();
  const userCookies = allCookies.filter(c => c.userId === req.userId);
  res.json({ success: true, data: userCookies });
});

router.put('/:cookieId', async (req: AuthRequest, res) => {
  const { cookieId } = req.params;
  const { status, name } = req.body;
  
  const cookies = cookieManager.getAllCookies();
  const cookie = cookies.find(c => c.id === cookieId);
  
  if (!cookie || cookie.userId !== req.userId) {
    return res.status(404).json({ success: false, message: 'Cookie not found' });
  }
  
  cookieManager.updateCookie(cookieId, { status, name });
  res.json({ success: true, message: 'Cookie updated' });
});

router.delete('/:cookieId', async (req: AuthRequest, res) => {
  const { cookieId } = req.params;
  const cookies = cookieManager.getAllCookies();
  const cookie = cookies.find(c => c.id === cookieId);
  
  if (!cookie || cookie.userId !== req.userId) {
    return res.status(404).json({ success: false, message: 'Cookie not found' });
  }
  
  cookieManager.removeCookie(cookieId);
  res.json({ success: true, message: 'Cookie deleted' });
});

router.delete('/clear/all', async (req: AuthRequest, res) => {
  const cookies = cookieManager.getAllCookies();
  const userCookies = cookies.filter(c => c.userId === req.userId);
  
  for (const cookie of userCookies) {
    cookieManager.removeCookie(cookie.id);
  }
  
  res.json({ success: true, message: 'All cookies cleared' });
});

router.get('/stats', async (req: AuthRequest, res) => {
  const stats = cookieManager.getStatistics();
  res.json({ success: true, data: stats });
});

export default router;