import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { shareService } from '../services/shareService';
import { ApiResponse } from '../types';
import logger from '../utils/logger';

export const createShare = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { link, totalShares } = req.body;
    const userId = req.userId!;

    const job = await shareService.startSharing(userId, link, totalShares);

    const response: ApiResponse = {
      success: true,
      message: 'Share job created successfully',
      data: job
    };
    res.status(201).json(response);
  } catch (error) {
    logger.error('Create share error:', error);
    const response: ApiResponse = {
      success: false,
      message: 'Failed to create share job',
      code: 'CREATE_SHARE_ERROR'
    };
    res.status(500).json(response);
  }
};

export const getShareStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const userId = req.userId!;

    const job = shareService.getJob(jobId);

    if (!job || job.userId !== userId) {
      const response: ApiResponse = {
        success: false,
        message: 'Share job not found',
        code: 'JOB_NOT_FOUND'
      };
      res.status(404).json(response);
      return;
    }

    const response: ApiResponse = {
      success: true,
      data: job
    };
    res.json(response);
  } catch (error) {
    logger.error('Get share status error:', error);
    const response: ApiResponse = {
      success: false,
      message: 'Failed to get share status',
      code: 'STATUS_ERROR'
    };
    res.status(500).json(response);
  }
};

export const getShareLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const userId = req.userId!;

    const job = shareService.getJob(jobId);

    if (!job || job.userId !== userId) {
      const response: ApiResponse = {
        success: false,
        message: 'Share job not found',
        code: 'JOB_NOT_FOUND'
      };
      res.status(404).json(response);
      return;
    }

    const logs = shareService.getJobLogs(jobId, limit);

    const response: ApiResponse = {
      success: true,
      data: logs
    };
    res.json(response);
  } catch (error) {
    logger.error('Get share logs error:', error);
    const response: ApiResponse = {
      success: false,
      message: 'Failed to get share logs',
      code: 'LOGS_ERROR'
    };
    res.status(500).json(response);
  }
};

export const cancelShare = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const userId = req.userId!;

    const job = shareService.getJob(jobId);

    if (!job || job.userId !== userId) {
      const response: ApiResponse = {
        success: false,
        message: 'Share job not found',
        code: 'JOB_NOT_FOUND'
      };
      res.status(404).json(response);
      return;
    }

    const cancelled = shareService.cancelJob(jobId);

    if (cancelled) {
      const response: ApiResponse = {
        success: true,
        message: 'Share job cancelled successfully'
      };
      res.json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        message: 'Unable to cancel job (already completed or failed)',
        code: 'CANCEL_FAILED'
      };
      res.status(400).json(response);
    }
  } catch (error) {
    logger.error('Cancel share error:', error);
    const response: ApiResponse = {
      success: false,
      message: 'Failed to cancel share job',
      code: 'CANCEL_ERROR'
    };
    res.status(500).json(response);
  }
};

export const getAllShares = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const jobs = shareService.getAllJobs(userId);

    const response: ApiResponse = {
      success: true,
      data: jobs.sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    };
    res.json(response);
  } catch (error) {
    logger.error('Get all shares error:', error);
    const response: ApiResponse = {
      success: false,
      message: 'Failed to get share history',
      code: 'HISTORY_ERROR'
    };
    res.status(500).json(response);
  }
};