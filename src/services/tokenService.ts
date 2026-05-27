import { CookieAccount, TokenData } from '../types';
import axios from 'axios';
import logger from '../utils/logger';

class TokenService {
  private tokenCache: Map<string, TokenData>;
  private readonly TOKEN_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutes buffer

  constructor() {
    this.tokenCache = new Map();
  }

  async getOrRefreshToken(cookie: CookieAccount): Promise<string | null> {
    const cached = this.tokenCache.get(cookie.id);
    
    if (cached && cached.expiresAt && new Date() < cached.expiresAt) {
      return cached.token;
    }

    const newToken = await this.extractToken(cookie);
    if (newToken) {
      this.tokenCache.set(cookie.id, {
        token: newToken,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // Assume 2 hours expiry
        cookieId: cookie.id
      });
      return newToken;
    }

    return null;
  }

  private async extractToken(cookie: CookieAccount): Promise<string | null> {
    const userAgent = cookie.userAgent || "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36";
    
    try {
      // Try multiple endpoints for token extraction
      const endpoints = [
        'https://business.facebook.com/business_locations',
        'https://www.facebook.com/adsmanager',
        'https://business.facebook.com/adsmanager'
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await axios.get(endpoint, {
            headers: {
              'user-agent': userAgent,
              'cookie': cookie.cookie,
              'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'accept-language': 'en-US,en;q=0.9',
              'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
              'sec-ch-ua-mobile': '?1',
              'sec-ch-ua-platform': '"Android"',
              'upgrade-insecure-requests': '1'
            },
            timeout: 15000,
            maxRedirects: 5
          });

          const patterns = [
            /"accessToken":"([^"]+)"/,
            /EAAG\w+/,
            /EAA[A-Za-z0-9]+/,
            /access_token=([^&\s"]+)/,
            /act=(\d+).*?token=([^&\s"]+)/
          ];

          for (const pattern of patterns) {
            const match = response.data.match(pattern);
            if (match) {
              const token = match[1] || match[2];
              if (token && token.length > 20) {
                logger.info(`Token extracted successfully for cookie ${cookie.id}`);
                return token;
              }
            }
          }
        } catch (error) {
          continue;
        }
      }

      logger.error(`Failed to extract token for cookie ${cookie.id}`);
      return null;
    } catch (error) {
      logger.error(`Token extraction error for cookie ${cookie.id}:`, error);
      return null;
    }
  }

  invalidateToken(cookieId: string): void {
    this.tokenCache.delete(cookieId);
  }

  clearCache(): void {
    this.tokenCache.clear();
  }
}

export const tokenService = new TokenService();