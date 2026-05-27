export interface User {
  id: string;
  username: string;
  password: string;
  createdAt: Date;
  lastLogin?: Date;
}

export interface CookieAccount {
  id: string;
  userId: string;
  cookie: string;
  name: string;
  status: 'active' | 'inactive' | 'banned';
  sharesCount: number;
  lastUsed?: Date;
  createdAt: Date;
  proxy?: string;
  userAgent?: string;
}

export interface ShareJob {
  id: string;
  userId: string;
  link: string;
  totalShares: number;
  successfulShares: number;
  failedShares: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  startTime: Date;
  endTime?: Date;
  cookiesUsed: string[];
  logs: ShareLog[];
}

export interface ShareLog {
  id: string;
  timestamp: Date;
  level: 'info' | 'warning' | 'error';
  message: string;
  cookieId?: string;
  shareId?: string;
}

export interface TokenData {
  token: string;
  expiresAt?: Date;
  cookieId: string;
}

export interface ShareResult {
  success: boolean;
  id?: string;
  error?: string;
  cookieId: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  code?: string;
}