import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { ShareJob, ShareResult, ShareLog, CookieAccount } from '../types';
import { cookieManager } from './cookieManager';
import { ShareLogger } from '../utils/logger';
import { tokenService } from './tokenService';

const USER_AGENTS = [
  "Mozilla/5.0 (Linux; Android 10; Wildfire E Lite) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/105.0.5195.136 Mobile Safari/537.36[FBAN/EMA;FBLC/en_US;FBAV/298.0.0.10.115;]",
  "Mozilla/5.0 (Linux; Android 11; KINGKONG 5 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/320.0.0.12.108;]",
  "Mozilla/5.0 (Linux; Android 11; G91 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/106.0.5249.126 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/325.0.1.4.108;]"
];

export class ShareService {
  private activeJobs: Map<string, ShareJob>;
  private jobLogs: Map<string, ShareLog[]>;
  private isProcessing: boolean = false;

  constructor() {
    this.activeJobs = new Map();
    this.jobLogs = new Map();
  }

  async startSharing(
    userId: string,
    link: string,
    totalShares: number
  ): Promise<ShareJob> {
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
    
    logger.info(`Share job created: ${totalShares} shares requested`);

    // Process asynchronously
    setImmediate(() => this.processShares(jobId));

    return job;
  }

  private async processShares(jobId: string): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job || job.status !== 'pending') return;

    job.status = 'processing';
    const logger = new ShareLogger(jobId);
    logger.info('Starting share processing');

    const results: ShareResult[] = [];
    let sharesProcessed = 0;

    while (sharesProcessed < job.totalShares && job.status === 'processing') {
      const cookie = cookieManager.getNextAvailableCookie();
      
      if (!cookie) {
        logger.warning('No available cookies, waiting...');
        await this.sleep(5000);
        continue;
      }

      const sharesToProcess = Math.min(
        10,
        job.totalShares - sharesProcessed
      );

      logger.info(`Processing batch of ${sharesToProcess} shares with cookie: ${cookie.name}`);

      for (let i = 0; i < sharesToProcess; i++) {
        if (job.status !== 'processing') break;

        const result = await this.performShare(job.link, cookie);
        results.push(result);
        
        if (result.success) {
          job.successfulShares++;
          cookieManager.markCookieUsed(cookie.id);
          if (!job.cookiesUsed.includes(cookie.id)) {
            job.cookiesUsed.push(cookie.id);
          }
        } else {
          job.failedShares++;
          this.handleShareError(cookie, result.error);
        }

        sharesProcessed++;
        job.progress = Math.round((sharesProcessed / job.totalShares) * 100);

        this.addLog(jobId, {
          id: uuidv4(),
          timestamp: new Date(),
          level: result.success ? 'info' : 'error',
          message: result.success ? `Share successful: ${result.id}` : `Share failed: ${result.error}`,
          cookieId: cookie.id,
          shareId: jobId
        });

        // Random delay to avoid detection
        await this.sleep(500 + Math.random() * 1000);
      }

      // Update job stats
      this.activeJobs.set(jobId, job);
    }

    this.finalizeJob(jobId);
  }

  private async performShare(
    link: string,
    cookie: CookieAccount
  ): Promise<ShareResult> {
    try {
      const token = await tokenService.getOrRefreshToken(cookie);
      if (!token) {
        return { success: false, error: 'Failed to get access token', cookieId: cookie.id };
      }

      const userAgent = cookie.userAgent || USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
      const proxyConfig = cookie.proxy ? { proxy: { host: cookie.proxy } } : {};

      const response = await axios.post(
        'https://graph.facebook.com/v18.0/me/feed',
        null,
        {
          params: {
            link: link,
            access_token: token,
            published: 0
          },
          headers: {
            'user-agent': userAgent,
            'Cookie': cookie.cookie,
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            'origin': 'https://business.facebook.com',
            'referer': 'https://business.facebook.com/'
          },
          timeout: 15000,
          ...proxyConfig
        }
      );

      if (response.data && response.data.id) {
        return {
          success: true,
          id: response.data.id,
          cookieId: cookie.id
        };
      }

      return { success: false, error: 'No ID in response', cookieId: cookie.id };
    } catch (error: any) {
      let errorMessage = error.message;
      
      if (error.response) {
        if (error.response.status === 429) {
          errorMessage = 'Rate limited by Facebook';
          // Mark cookie for cooldown
          cookieManager.updateCookie(cookie.id, { status: 'inactive' });
          setTimeout(() => {
            cookieManager.updateCookie(cookie.id, { status: 'active' });
          }, 60000);
        } else if (error.response.status === 400) {
          errorMessage = 'Invalid request or token expired';
          cookieManager.updateCookie(cookie.id, { status: 'banned' });
        }
      }
      
      return { success: false, error: errorMessage, cookieId: cookie.id };
    }
  }

  private handleShareError(cookie: CookieAccount, error?: string): void {
    if (error?.includes('rate limited')) {
      cookieManager.updateCookie(cookie.id, { status: 'inactive' });
      setTimeout(() => {
        cookieManager.updateCookie(cookie.id, { status: 'active' });
      }, 60000);
    } else if (error?.includes('token expired') || error?.includes('Invalid request')) {
      cookieManager.updateCookie(cookie.id, { status: 'banned' });
    }
  }

  private addLog(jobId: string, log: ShareLog): void {
    const logs = this.jobLogs.get(jobId) || [];
    logs.push(log);
    this.jobLogs.set(jobId, logs);
    
    if (logs.length > 1000) {
      this.jobLogs.set(jobId, logs.slice(-500));
    }
  }

  private finalizeJob(jobId: string): void {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    if (job.status === 'cancelled') {
      job.status = 'cancelled';
    } else {
      job.status = job.successfulShares > 0 ? 'completed' : 'failed';
    }
    
    job.endTime = new Date();
    this.activeJobs.set(jobId, job);

    const logger = new ShareLogger(jobId);
    logger.info(`Job finalized: ${job.successfulShares} successful, ${job.failedShares} failed`);
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
      const logger = new ShareLogger(jobId);
      logger.info('Job cancelled by user');
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