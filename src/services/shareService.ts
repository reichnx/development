import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { ShareJob, ShareResult, ShareLog, CookieAccount } from '../types';
import { cookieManager } from './cookieManager';
import { ShareLogger } from '../utils/logger';

const USER_AGENTS = [
  "Mozilla/5.0 (Linux; Android 10; Wildfire E Lite) AppleWebKit/537.36[FBAN/EMA;FBLC/en_US;FBAV/298.0.0.10.115;]",
  "Mozilla/5.0 (Linux; Android 11; KINGKONG 5 Pro) AppleWebKit/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/320.0.0.12.108;]",
  "Mozilla/5.0 (Linux; Android 11; G91 Pro) AppleWebKit/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/325.0.1.4.108;]"
];

class TokenService {
  private tokenCache: Map<string, string>;

  constructor() {
    this.tokenCache = new Map();
  }

  async extractToken(cookie: CookieAccount): Promise<string | null> {
    const cached = this.tokenCache.get(cookie.id);
    if (cached) return cached;

    const userAgent = cookie.userAgent || USER_AGENTS[0];
    
    try {
      const response = await axios.get('https://business.facebook.com/business_locations', {
        headers: {
          'user-agent': userAgent,
          'cookie': cookie.cookie,
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 15000
      });
      
      const patterns = [/(EAAG\w+)/, /(EAA[A-Za-z0-9]+)/, /access_token=([^&\s"]+)/];
      
      for (const pattern of patterns) {
        const match = response.data.match(pattern);
        if (match) {
          const token = match[1];
          this.tokenCache.set(cookie.id, token);
          return token;
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  invalidateToken(cookieId: string) {
    this.tokenCache.delete(cookieId);
  }
}

const tokenService = new TokenService();

export class ShareService {
  private activeJobs: Map<string, ShareJob>;
  private jobLogs: Map<string, ShareLog[]>;

  constructor() {
    this.activeJobs = new Map();
    this.jobLogs = new Map();
  }

  async startSharing(userId: string, link: string, totalShares: number): Promise<ShareJob> {
    const jobId = uuidv4();
    const logger = new ShareLogger(jobId);

    const job: ShareJob = {
      id: jobId,
      userId,
      link,
      totalShares,
      successfulShares: 0,
      failedShares: 0,
      status: 'pending',
      progress: 0,
      startTime: new Date(),
      cookiesUsed: [],
      logs: []
    };

    this.activeJobs.set(jobId, job);
    this.jobLogs.set(jobId, []);
    
    logger.info(`Share job created: ${totalShares} shares`);

    setImmediate(() => this.processShares(jobId));

    return job;
  }

  private async processShares(jobId: string): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job || job.status !== 'pending') return;

    job.status = 'processing';
    const logger = new ShareLogger(jobId);
    logger.info('Starting share processing');

    let sharesProcessed = 0;

    while (sharesProcessed < job.totalShares && job.status === 'processing') {
      const cookie = cookieManager.getNextAvailableCookie();
      
      if (!cookie) {
        await this.sleep(5000);
        continue;
      }

      const result = await this.performShare(job.link, cookie);
      
      if (result.success) {
        job.successfulShares++;
        cookieManager.markCookieUsed(cookie.id);
        if (!job.cookiesUsed.includes(cookie.id)) {
          job.cookiesUsed.push(cookie.id);
        }
      } else {
        job.failedShares++;
        if (result.error?.includes('token')) {
          tokenService.invalidateToken(cookie.id);
        }
      }

      sharesProcessed++;
      job.progress = Math.round((sharesProcessed / job.totalShares) * 100);

      this.addLog(jobId, {
        id: uuidv4(),
        timestamp: new Date(),
        level: result.success ? 'info' : 'error',
        message: result.success ? `✅ Share successful` : `❌ Share failed: ${result.error}`,
        cookieId: cookie.id,
        shareId: jobId
      });

      this.activeJobs.set(jobId, job);
      
      await this.sleep(1000 + Math.random() * 2000);
    }

    job.status = job.successfulShares > 0 ? 'completed' : 'failed';
    job.endTime = new Date();
    job.duration = (job.endTime.getTime() - job.startTime.getTime()) / 1000;
    this.activeJobs.set(jobId, job);

    logger.info(`Job completed: ${job.successfulShares} successful, ${job.failedShares} failed`);
  }

  private async performShare(link: string, cookie: CookieAccount): Promise<ShareResult> {
    try {
      const token = await tokenService.extractToken(cookie);
      if (!token) {
        return { success: false, error: 'Failed to get access token', cookieId: cookie.id };
      }

      const userAgent = cookie.userAgent || USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

      const response = await axios.post('https://graph.facebook.com/v18.0/me/feed', null, {
        params: {
          link: link,
          access_token: token,
          published: 0
        },
        headers: {
          'user-agent': userAgent,
          'Cookie': cookie.cookie,
          'accept': 'application/json, text/plain, */*'
        },
        timeout: 15000
      });

      if (response.data && response.data.id) {
        return { success: true, id: response.data.id, cookieId: cookie.id };
      }

      return { success: false, error: 'No ID in response', cookieId: cookie.id };
    } catch (error: any) {
      let errorMessage = error.message;
      if (error.response?.status === 429) {
        errorMessage = 'Rate limited';
      } else if (error.response?.status === 400) {
        errorMessage = 'Invalid token or request';
      }
      return { success: false, error: errorMessage, cookieId: cookie.id };
    }
  }

  private addLog(jobId: string, log: ShareLog): void {
    const logs = this.jobLogs.get(jobId) || [];
    logs.push(log);
    this.jobLogs.set(jobId, logs.slice(-500));
  }

  getJob(jobId: string): ShareJob | undefined {
    return this.activeJobs.get(jobId);
  }

  getJobLogs(jobId: string, limit: number = 100): ShareLog[] {
    const logs = this.jobLogs.get(jobId) || [];
    return logs.slice(-limit);
  }

  cancelJob(jobId: string): boolean {
    const job = this.activeJobs.get(jobId);
    if (job && (job.status === 'pending' || job.status === 'processing')) {
      job.status = 'cancelled';
      this.activeJobs.set(jobId, job);
      return true;
    }
    return false;
  }

  getAllJobs(userId?: string): ShareJob[] {
    const jobs = Array.from(this.activeJobs.values());
    if (userId) {
      return jobs.filter(job => job.userId === userId);
    }
    return jobs;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const shareService = new ShareService();