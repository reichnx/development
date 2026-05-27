import { EventEmitter } from 'events';
import { CookieAccount, ShareResult } from '../types';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import axios from 'axios';

interface CookieRotationConfig {
  maxSharesPerCookie: number;
  cooldownPeriod: number;
  healthCheckInterval: number;
}

export class CookieManager extends EventEmitter {
  private cookies: Map<string, CookieAccount>;
  private activeCookies: Set<string>;
  private cookieUsageCount: Map<string, number>;
  private cookieCooldown: Map<string, number>;
  private config: CookieRotationConfig;

  constructor(config?: Partial<CookieRotationConfig>) {
    super();
    this.cookies = new Map();
    this.activeCookies = new Set();
    this.cookieUsageCount = new Map();
    this.cookieCooldown = new Map();
    this.config = {
      maxSharesPerCookie: 50,
      cooldownPeriod: 60000, // 1 minute
      healthCheckInterval: 300000, // 5 minutes
      ...config
    };

    this.startHealthCheck();
  }

  addCookie(cookie: CookieAccount): void {
    this.cookies.set(cookie.id, cookie);
    if (cookie.status === 'active') {
      this.activeCookies.add(cookie.id);
    }
    logger.info(`Cookie added: ${cookie.name} (${cookie.id})`);
    this.emit('cookie-added', cookie);
  }

  removeCookie(cookieId: string): boolean {
    const deleted = this.cookies.delete(cookieId);
    this.activeCookies.delete(cookieId);
    this.cookieUsageCount.delete(cookieId);
    this.cookieCooldown.delete(cookieId);
    
    if (deleted) {
      logger.info(`Cookie removed: ${cookieId}`);
      this.emit('cookie-removed', cookieId);
    }
    
    return deleted;
  }

  updateCookie(cookieId: string, updates: Partial<CookieAccount>): boolean {
    const cookie = this.cookies.get(cookieId);
    if (!cookie) return false;

    Object.assign(cookie, updates);
    
    if (updates.status === 'active') {
      this.activeCookies.add(cookieId);
    } else if (updates.status === 'inactive') {
      this.activeCookies.delete(cookieId);
    }

    logger.info(`Cookie updated: ${cookieId}`);
    this.emit('cookie-updated', cookie);
    return true;
  }

  getNextAvailableCookie(): CookieAccount | null {
    const now = Date.now();
    
    for (const cookieId of this.activeCookies) {
      const cooldownUntil = this.cookieCooldown.get(cookieId) || 0;
      const usageCount = this.cookieUsageCount.get(cookieId) || 0;
      
      if (now >= cooldownUntil && usageCount < this.config.maxSharesPerCookie) {
        const cookie = this.cookies.get(cookieId);
        if (cookie && cookie.status === 'active') {
          return cookie;
        }
      }
    }
    
    return null;
  }

  markCookieUsed(cookieId: string): void {
    const usageCount = (this.cookieUsageCount.get(cookieId) || 0) + 1;
    this.cookieUsageCount.set(cookieId, usageCount);
    
    if (usageCount >= this.config.maxSharesPerCookie) {
      this.putCookieOnCooldown(cookieId);
    }
    
    const cookie = this.cookies.get(cookieId);
    if (cookie) {
      cookie.sharesCount++;
      cookie.lastUsed = new Date();
      this.cookies.set(cookieId, cookie);
    }
  }

  private putCookieOnCooldown(cookieId: string): void {
    const cooldownUntil = Date.now() + this.config.cooldownPeriod;
    this.cookieCooldown.set(cookieId, cooldownUntil);
    this.cookieUsageCount.set(cookieId, 0);
    
    setTimeout(() => {
      this.cookieCooldown.delete(cookieId);
      logger.info(`Cookie ${cookieId} removed from cooldown`);
      this.emit('cookie-ready', cookieId);
    }, this.config.cooldownPeriod);
    
    logger.info(`Cookie ${cookieId} put on cooldown until ${new Date(cooldownUntil)}`);
  }

  async validateCookie(cookie: string, userAgent: string): Promise<boolean> {
    try {
      const response = await axios.get('https://graph.facebook.com/me', {
        params: {
          access_token: await this.extractToken(cookie, userAgent),
          fields: 'id,name'
        },
        timeout: 10000
      });
      
      return response.data && response.data.id ? true : false;
    } catch (error) {
      logger.error('Cookie validation failed:', error);
      return false;
    }
  }

  private async extractToken(cookie: string, userAgent: string): Promise<string | null> {
    try {
      const response = await axios.get('https://business.facebook.com/business_locations', {
        headers: {
          'user-agent': userAgent,
          'cookie': cookie,
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 15000
      });
      
      const patterns = [/(EAAG\w+)/, /(EAA[A-Za-z0-9]+)/, /access_token=([^&\s"]+)/];
      
      for (const pattern of patterns) {
        const match = response.data.match(pattern);
        if (match) return match[1];
      }
      
      return null;
    } catch (error) {
      logger.error('Token extraction failed:', error);
      return null;
    }
  }

  private startHealthCheck(): void {
    setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  private async performHealthCheck(): Promise<void> {
    logger.info('Performing cookie health check...');
    
    for (const [cookieId, cookie] of this.cookies) {
      if (cookie.status === 'active') {
        const isValid = await this.validateCookie(cookie.cookie, cookie.userAgent || '');
        
        if (!isValid) {
          this.updateCookie(cookieId, { status: 'banned' });
          logger.warn(`Cookie ${cookie.name} marked as banned due to validation failure`);
          this.emit('cookie-banned', cookieId);
        }
      }
    }
  }

  getAllCookies(): CookieAccount[] {
    return Array.from(this.cookies.values());
  }

  getActiveCookiesCount(): number {
    return this.activeCookies.size;
  }

  getStatistics(): any {
    const total = this.cookies.size;
    const active = this.activeCookies.size;
    const banned = Array.from(this.cookies.values()).filter(c => c.status === 'banned').length;
    const totalShares = Array.from(this.cookies.values()).reduce((sum, c) => sum + c.sharesCount, 0);
    
    return {
      total,
      active,
      banned,
      totalShares,
      available: this.getNextAvailableCookie() !== null
    };
  }
}

export const cookieManager = new CookieManager();