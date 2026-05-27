import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { User, ApiResponse } from '../types';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';

// In-memory user store (replace with database in production)
const users: Map<string, User> = new Map();

// Create default admin user if none exists
const initializeAdmin = async () => {
  if (users.size === 0) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin: User = {
      id: uuidv4(),
      username: 'admin',
      password: hashedPassword,
      createdAt: new Date()
    };
    users.set(admin.username, admin);
    logger.info('Default admin user created: admin / admin123');
  }
};
initializeAdmin();

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (users.has(username)) {
      const response: ApiResponse = {
        success: false,
        message: 'Username already exists',
        code: 'USER_EXISTS'
      };
      res.status(400).json(response);
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user: User = {
      id: uuidv4(),
      username,
      password: hashedPassword,
      createdAt: new Date()
    };

    users.set(username, user);
    logger.info(`New user registered: ${username}`);

    const response: ApiResponse = {
      success: true,
      message: 'User registered successfully',
      data: { username: user.username, id: user.id }
    };
    res.status(201).json(response);
  } catch (error) {
    logger.error('Registration error:', error);
    const response: ApiResponse = {
      success: false,
      message: 'Registration failed',
      code: 'REGISTRATION_ERROR'
    };
    res.status(500).json(response);
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;
    const user = users.get(username);

    if (!user) {
      const response: ApiResponse = {
        success: false,
        message: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      };
      res.status(401).json(response);
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      const response: ApiResponse = {
        success: false,
        message: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      };
      res.status(401).json(response);
      return;
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    );

    user.lastLogin = new Date();
    users.set(username, user);
    logger.info(`User logged in: ${username}`);

    const response: ApiResponse = {
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          createdAt: user.createdAt
        }
      }
    };
    res.json(response);
  } catch (error) {
    logger.error('Login error:', error);
    const response: ApiResponse = {
      success: false,
      message: 'Login failed',
      code: 'LOGIN_ERROR'
    };
    res.status(500).json(response);
  }
};

export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = Array.from(users.values()).find(u => u.id === req.userId);
    
    if (!user) {
      const response: ApiResponse = {
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      };
      res.status(404).json(response);
      return;
    }

    const response: ApiResponse = {
      success: true,
      data: {
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    };
    res.json(response);
  } catch (error) {
    logger.error('Profile error:', error);
    const response: ApiResponse = {
      success: false,
      message: 'Failed to get profile',
      code: 'PROFILE_ERROR'
    };
    res.status(500).json(response);
  }
};

export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = Array.from(users.values()).find(u => u.id === req.userId);

    if (!user) {
      const response: ApiResponse = {
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      };
      res.status(404).json(response);
      return;
    }

    const isValidPassword = await bcrypt.compare(oldPassword, user.password);
    if (!isValidPassword) {
      const response: ApiResponse = {
        success: false,
        message: 'Current password is incorrect',
        code: 'INVALID_PASSWORD'
      };
      res.status(401).json(response);
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    users.set(user.username, user);

    logger.info(`Password changed for user: ${user.username}`);

    const response: ApiResponse = {
      success: true,
      message: 'Password changed successfully'
    };
    res.json(response);
  } catch (error) {
    logger.error('Password change error:', error);
    const response: ApiResponse = {
      success: false,
      message: 'Failed to change password',
      code: 'PASSWORD_ERROR'
    };
    res.status(500).json(response);
  }
};