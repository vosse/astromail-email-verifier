import { Controller, Post, Body, Logger } from '@nestjs/common';
import { EmailVerificationService } from './email-verification.service';
import { VerificationResult } from './verification-result.interface';

@Controller('email-verification')
export class EmailVerificationController {
  private readonly logger = new Logger(EmailVerificationController.name);

  constructor(
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Post('verify')
  async verifyEmail(@Body('email') email: string): Promise<VerificationResult> {
    this.logger.log(`Received email verification request for: ${email}`);
    try {
      const result = await this.emailVerificationService.verifyEmail(email);
      this.logger.log(
        `Verification result for ${email}: ${JSON.stringify(result)}`,
      );
      return result;
    } catch (error) {
      this.logger.error(`Error verifying email ${email}: ${error.message}`);
      throw error;
    }
  }
}
