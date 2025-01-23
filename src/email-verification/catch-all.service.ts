import { Injectable, Logger } from '@nestjs/common';
import { SmtpCheckService } from './smtp-check.service';

@Injectable()
export class CatchAllService {
  private readonly logger = new Logger(CatchAllService.name);

  constructor(private readonly smtpCheckService: SmtpCheckService) {}

  async isCatchAll(domain: string): Promise<boolean> {
    try {
      // Generate a random local part
      const randomLocalPart = `test${Date.now()}${Math.random()
        .toString(36)
        .substring(7)}`;
      const isValid = await this.smtpCheckService.performSmtpVerification(
        domain,
        randomLocalPart,
      );
      return isValid; // If it accepts a random local part, it's likely catch-all
    } catch (error) {
      this.logger.error(
        `Catch-all detection failed for ${domain}: ${error.message}`,
      );
      return false;
    }
  }
}
