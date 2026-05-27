import { body, param, query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';

export const validateRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const response: ApiResponse = {
      success: false,
      message: 'Validation failed',
      error: errors.array()[0].msg,
      code: 'VALIDATION_ERROR'
    };
    res.status(400).json(response);
    return;
  }
  next();
};

export const shareValidation = [
  body('link')
    .isURL()
    .withMessage('Valid Facebook post URL is required')
    .custom((value) => {
      return value.includes('facebook.com') || value.includes('fb.com');
    })
    .withMessage('Must be a Facebook URL'),
  body('totalShares')
    .isInt({ min: 1, max: parseInt(process.env.MAX_SHARES_PER_REQUEST || '500') })
    .withMessage(`Total shares must be between 1 and ${process.env.MAX_SHARES_PER_REQUEST || 500}`)
];

export const cookieValidation = [
  body('cookie')
    .notEmpty()
    .withMessage('Cookie is required')
    .isString()
    .withMessage('Cookie must be a string')
    .custom((value) => {
      return value.includes('=') && value.length > 20;
    })
    .withMessage('Invalid cookie format'),
  body('name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Name must be 1-50 characters')
];

export const loginValidation = [
  body('username')
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be 3-50 characters'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
];

export const paginationValidation = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be 0 or greater')
    .toInt()
];