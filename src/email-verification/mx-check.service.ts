import { Injectable, Logger } from '@nestjs/common';
import * as dns from 'dns';
import { promisify } from 'util';

interface CacheEntry {
  value: boolean;
  expires: number;
}

@Injectable()
export class MxCheckService {
  private readonly logger = new Logger(MxCheckService.name);
  private readonly resolveMx = promisify(dns.resolveMx);
  private readonly resolve4 = promisify(dns.resolve4);
  private readonly resolve6 = promisify(dns.resolve6);

  // Configure DNS resolver to use Cloudflare's DNS for better performance
  private readonly resolver: dns.Resolver;

  // Cache MX records with TTL (5 minutes by default)
  private readonly mxCache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_DELAY = 1000; // 1 second

  constructor() {
    this.resolver = new dns.Resolver({
      timeout: 5000, // 5 second timeout
      tries: 1,
    });

    // Use Cloudflare's DNS servers for faster lookups
    this.resolver.setServers(['1.1.1.1', '1.0.0.1']);
  }

  async hasMxRecord(domain: string): Promise<boolean> {
    try {
      // Check cache first
      const cached = this.mxCache.get(domain);
      if (cached && cached.expires > Date.now()) {
        return cached.value;
      }

      let result = false;
      let retries = 0;

      while (retries <= this.MAX_RETRIES) {
        try {
          // First try MX records
          try {
            const mxRecords = await this.resolveMx(domain);
            if (mxRecords && mxRecords.length > 0) {
              result = true;
              break;
            }
          } catch (err) {
            if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
              throw err;
            }
          }

          // Then try A records
          try {
            const aRecords = await this.resolve4(domain);
            if (aRecords && aRecords.length > 0) {
              result = true;
              break;
            }
          } catch (err) {
            if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
              throw err;
            }
          }

          // Finally try AAAA records
          try {
            const aaaaRecords = await this.resolve6(domain);
            if (aaaaRecords && aaaaRecords.length > 0) {
              result = true;
              break;
            }
          } catch (err) {
            if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
              throw err;
            }
          }

          break; // If we get here with no errors, domain exists but has no mail records
        } catch (error) {
          if (
            retries === this.MAX_RETRIES ||
            (error.code !== 'ETIMEDOUT' && error.code !== 'ECONNRESET')
          ) {
            throw error;
          }
          retries++;
          await new Promise((resolve) =>
            setTimeout(resolve, this.RETRY_DELAY * retries),
          );
        }
      }

      // Cache the result
      this.mxCache.set(domain, {
        value: result,
        expires: Date.now() + this.CACHE_TTL,
      });

      // Log the result
      if (result) {
        this.logger.debug(`Valid mail records found for ${domain}`);
      } else {
        this.logger.debug(`No valid mail records found for ${domain}`);
      }

      return result;
    } catch (error) {
      this.logger.error(
        `DNS lookup failed for ${domain}: ${error.message}`,
        error.stack,
      );

      // Cache negative result for a shorter time
      this.mxCache.set(domain, {
        value: false,
        expires: Date.now() + this.CACHE_TTL / 5, // Cache errors for 1 minute
      });

      return false;
    }
  }

  /**
   * Cleanup expired cache entries - call this periodically
   */
  public cleanupCache(): void {
    const now = Date.now();
    for (const [domain, entry] of this.mxCache.entries()) {
      if (entry.expires <= now) {
        this.mxCache.delete(domain);
      }
    }
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; hitRate: number } {
    const now = Date.now();
    let validEntries = 0;

    for (const entry of this.mxCache.values()) {
      if (entry.expires > now) {
        validEntries++;
      }
    }

    return {
      size: this.mxCache.size,
      hitRate: validEntries / this.mxCache.size,
    };
  }
}
