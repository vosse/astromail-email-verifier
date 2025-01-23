import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dns from 'dns';
import { promisify } from 'util';

@Injectable()
export class DomainCheckService {
  private readonly logger = new Logger(DomainCheckService.name);
  private readonly dnsResolve = promisify(dns.resolve);

  constructor(private configService: ConfigService) {}

  async checkDomainExists(domain: string): Promise<boolean> {
    const retryOptions = {
      retries: this.configService.get<number>('DNS_RETRIES') || 2,
      factor: this.configService.get<number>('DNS_RETRY_FACTOR') || 2,
      minTimeout:
        this.configService.get<number>('DNS_RETRY_MIN_TIMEOUT') || 1000,
      maxTimeout:
        this.configService.get<number>('DNS_RETRY_MAX_TIMEOUT') || 5000,
    };

    try {
      // Check A records with retry
      const hasA = await this.retryResolve(domain, 'A', retryOptions);
      if (hasA) return true;

      // Check AAAA records with retry
      const hasAAAA = await this.retryResolve(domain, 'AAAA', retryOptions);
      if (hasAAAA) return true;

      // If no A/AAAA records found
      this.logger.debug(`Domain ${domain} does not have A/AAAA records.`);
      return false;
    } catch (error) {
      this.logger.error(`Domain check failed for ${domain}: ${error.message}`);
      return false;
    }
  }

  private async retryResolve(
    domain: string,
    type: string,
    options: {
      retries: number;
      factor: number;
      minTimeout: number;
      maxTimeout: number;
    },
  ): Promise<boolean> {
    let attempts = 0;
    while (attempts <= options.retries) {
      try {
        await this.dnsResolve(domain, type);
        return true;
      } catch (error) {
        if (attempts === options.retries) {
          throw error;
        }
        const timeout = Math.min(
          options.minTimeout * Math.pow(options.factor, attempts),
          options.maxTimeout,
        );
        await new Promise((resolve) => setTimeout(resolve, timeout));
        attempts++;
      }
    }
    return false;
  }
}
