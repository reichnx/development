import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from '../middleware/auth';
import { cookieManager } from '../services/cookieManager';
import { ApiResponse, CookieAccount } from '../types';
import logger from '../utils/logger';

export const addCookie = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { cookie, name, proxy } = req.body;
    const userId = req.userId!;

    const newCookie: CookieAccount = {
      id: uuidv4(),
      userId,
      cookie,
      name: name || `Cookie-${Date.now()}`,
      status: 'active',
      sharesCount: 0,
      createdAt: new Date(),
      proxy
    };

    // Validate cookie before adding
    const isValid = await cookieManager.validateCookie(cookie, 
      "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36"
    );

    if (!isValid) {
      const response: ApiResponse = {
        success: false,
        message: 'Invalid cookie. Please check your Facebook cookie.',
        code: 'INVALID_COOKIE'
      };
      res.status(400).json(response);
      return;
    }

    cookieManager.addCookie(newCookie);
    logger.info(`Cookie added by user ${userId}: ${newCookie.name}`);

    const response: ApiResponse = {
      success: true,
      message: 'Cookie added successfully',
      data: newCookie
    };
    res.json(response);
  } catch (error) {
    logger.error('Add cookie error:', error);
    const response: ApiResponse = {
      success: false,
      message: 'Failed to add cookie',
      code: 'ADD_COOKIE_ERROR'
    };
    res.status(500).json(response);
  }
};

export const getCookies = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const allCookies = cookieManager.getAllCookies();
    const userCookies = allCookies.filter(c => c.userId === userId);

    const response: ApiResponse = {
      success: true,
      data: userCookies
    };
    res.json(response);
  } catch (error) {
    logger.error('Get cookies error:', error);
    const response: ApiResponse = {
      success: false,
      message: 'Failed to get cookies',
      code: 'GET_COOKIES_ERROR'
    };
    res.status(500).json(response);
  }
};

export const updateCookie = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { cookieId } = req.params;
    const { status, name } = req.body;
    const userId = req.userId!;

    const cookies = cookieManager.getAllCookies();
    const cookie = cookies.find(c => c.id === cookieId);

    if (!cookie || cookie.userId !== userId) {
      const response: ApiResponse = {
        success: false,
        message: 'Cookie not found',
        code: 'COOKIE_NOT_FOUND'
      };
      res.status(404).json(response);
      return;
    }

    const updates: Partial<CookieAccount> = {};
    if (status) updates.status = status;
    if (name) updates.name = name;

    cookieManager.updateCookie(cookieId, updates);
    logger.info(`Cookie updated by user ${userId}: ${cookieId}`);

    const response: ApiResponse = {
      success: true,
      message: 'Cookie updated successfully'
    };
    res.json(response);
  } catch (error) {
    logger.error('Update cookie error:', error);
    const response: ApiResponse = {
      success: false,
      message: 'Failed to update cookie',
      code: 'UPDATE_COOKIE_ERROR'
    };
    res.status(500).json(response);
  }
};

export const deleteCookie = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { cookieId } = req.params;
    const userId = req.userId!;

    const cookies = cookieManager.getAllCookies();
    const cookie = cookies.find(c => c.id === cookieId);

    if (!cookie || cookie.userId !== userId) {
      const response: ApiResponse = {
        success: false,
        message: 'Cookie not found',
        code: 'COOKIE_NOT_FOUND'
      };
      res.status(404).json(response);
      return;
    }

    cookieManager.removeCookie(cookieId);
    logger.info(`Cookie deleted by user ${userId}: ${cookieId}`);

    const response: ApiResponse = {
      success: true,
      message: 'Cookie deleted successfully'
    };
    res.json(response);
  } catch (error) {
    logger.error('Delete cookie error:', error);
    const response: ApiResponse = {
      success: false,
      message: 'Failed to delete cookie',
      code: 'DELETE_COOKIE_ERROR'
    };
    res.status(500).json(response);
  }
};

export const clearAllCookies = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const cookies = cookieManager.getAllCookies();
    const userCookies = cookies.filter(c => c.userId === userId);

    for (const cookie of userCookies) {
      cookieManager.removeCookie(cookie.id);
    }

    logger.info(`All cookies cleared by user ${userId}`);

    const response: ApiResponse = {
      success: true,
      message: 'All cookies cleared successfully'
    };
    res.json(response);
  } catch (error) {
    logger.error('Clear cookies error:', error);
    const response: ApiResponse = {
      success: false,
      message: 'Failed to clear cookies',
      code: 'CLEAR_COOKIES_ERROR'
    };
    res.status(500).json(response);
  }
};

export const getCookieStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stats = cookieManager.getStatistics();
    
    const response: ApiResponse = {
      success: true,
      data: stats
    };
    res.json(response);
  } catch (error) {
    logger.error('Get cookie stats error:', error);
    const response: ApiResponse = {
      success: false,
      message: 'Failed to get cookie statistics',
      code: 'STATS_ERROR'
    };
    res.status(500).json(response);
  }
};