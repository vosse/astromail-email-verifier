import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class DisposableDomainService {
  private readonly logger = new Logger(DisposableDomainService.name);

  private readonly disposableDomains = new Set([
    'tempmail.com',
    'throwawaymail.com',
    '10minutemail.com',
    'yopmail.com',
    'guerrillamail.com',
    // ... etc.
  ]);

  async isDisposableDomain(domain: string): Promise<boolean> {
    try {
      // Basic local check
      if (this.disposableDomains.has(domain.toLowerCase())) {
        return true;
      }

      // Potentially call an external API here, if needed:
      // const isDisposable = await this.externalDisposableApiCheck(domain);
      // return isDisposable;

      return false;
    } catch (error) {
      this.logger.error(
        `Disposable domain check failed for ${domain}: ${error.message}`,
      );
      return false;
    }
  }
}
