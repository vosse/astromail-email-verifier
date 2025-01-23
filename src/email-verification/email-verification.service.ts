import { Injectable, Logger } from '@nestjs/common';
import * as punycode from 'punycode';
import { ConfigService } from '@nestjs/config';

import { VerificationResult } from './verification-result.interface';
import { FormatValidatorService } from './format-validator.service';
import { RoleBasedService } from './role-based.service';
import { DisposableDomainService } from './disposable-domain.service';
import { DomainCheckService } from './domain-check.service';
import { MxCheckService } from './mx-check.service';
import { SmtpCheckService } from './smtp-check.service';
import { CatchAllService } from './catch-all.service';
import { ScoringService } from './scoring.service';

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  // Example well-known domains
  private readonly wellKnownDomains = new Set([
    'gmail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'aol.com',
    'icloud.com',
    'protonmail.com',
    'proton.me',
    'zoho.com',
    'mail.com',
    'gmx.com',
    'yandex.com',
    'microsoft.com',
    'googlemail.com',
    'live.com',
  ]);

  constructor(
    private readonly configService: ConfigService,
    private readonly formatValidator: FormatValidatorService,
    private readonly roleBasedService: RoleBasedService,
    private readonly disposableDomainService: DisposableDomainService,
    private readonly domainCheckService: DomainCheckService,
    private readonly mxCheckService: MxCheckService,
    private readonly smtpCheckService: SmtpCheckService,
    private readonly catchAllService: CatchAllService,
    private readonly scoringService: ScoringService,
  ) {}

  async verifyEmail(email: string): Promise<VerificationResult> {
    const result: VerificationResult = {
      isValid: false,
      checks: {
        formatValid: false,
        disposable: false,
        domainExists: false,
        hasMxRecord: false,
        smtpValid: false,
        catchAll: false,
      },
      score: 0,
    };

    try {
      // 1. Format Validation
      result.checks.formatValid = this.formatValidator.isValidFormat(email);
      if (!result.checks.formatValid) {
        result.reason = 'Invalid email format';
        return this.scoringService.calculateScore(result);
      }

      const [localPart, domain] = email.split('@');
      const punycodeDomain = punycode.toASCII(domain);

      // 2. Role-based check (optional scoring penalty)
      if (this.roleBasedService.isRoleBasedEmail(localPart)) {
        result.score -= 20;
      }

      // 3. Disposable domain check
      result.checks.disposable =
        await this.disposableDomainService.isDisposableDomain(punycodeDomain);
      if (result.checks.disposable) {
        result.reason = 'Disposable email domain';
        return this.scoringService.calculateScore(result);
      }

      // 4. Domain check
      result.checks.domainExists =
        await this.domainCheckService.checkDomainExists(punycodeDomain);
      if (!result.checks.domainExists) {
        result.reason = 'Domain does not exist';
        return this.scoringService.calculateScore(result);
      }

      // 5. MX check
      result.checks.hasMxRecord =
        await this.mxCheckService.hasMxRecord(punycodeDomain);
      if (!result.checks.hasMxRecord) {
        result.reason = 'No MX records found';
        return this.scoringService.calculateScore(result);
      }

      // 6. Well-known providers
      if (this.isWellKnownProvider(punycodeDomain)) {
        // If well-known, skip full SMTP check
        result.checks.smtpValid = true;
        result.score += 30;
      } else {
        // 7. Perform SMTP check
        result.checks.smtpValid =
          await this.smtpCheckService.performSmtpVerification(
            punycodeDomain,
            localPart,
          );

        // 8. Catch-all detection
        result.checks.catchAll =
          await this.catchAllService.isCatchAll(punycodeDomain);
        if (result.checks.catchAll) {
          result.score -= 15;
        }
      }

      // Calculate final scoring
      return this.scoringService.calculateScore(result);
    } catch (error) {
      this.logger.error(`Verification failed for ${email}: ${error.message}`);
      result.reason = 'Verification process failed';
      return this.scoringService.calculateScore(result);
    }
  }

  private isWellKnownProvider(domain: string): boolean {
    const domainBase = domain.toLowerCase();
    return (
      this.wellKnownDomains.has(domainBase) ||
      Array.from(this.wellKnownDomains).some((known) =>
        domainBase.endsWith('.' + known),
      )
    );
  }
}

// import { Injectable, Logger } from '@nestjs/common';
// import * as punycode from 'punycode';
// import { ConfigService } from '@nestjs/config';

// import {
//   VerificationResult,
//   SmtpVerificationResult,
// } from './verification-result.interface';
// import { FormatValidatorService } from './format-validator.service';
// import { RoleBasedService } from './role-based.service';
// import { DisposableDomainService } from './disposable-domain.service';
// import { DomainCheckService } from './domain-check.service';
// import { MxCheckService } from './mx-check.service';
// import { SmtpCheckService } from './smtp-check.service';
// import { CatchAllService } from './catch-all.service';
// import { ScoringService } from './scoring.service';

// @Injectable()
// export class EmailVerificationService {
//   private readonly logger = new Logger(EmailVerificationService.name);
//   private readonly scoreThreshold: number;
//   private readonly enableDetailedLogs: boolean;

//   // Well-known providers that can skip full SMTP verification
//   private readonly wellKnownDomains = new Set([
//     'gmail.com',
//     'yahoo.com',
//     'hotmail.com',
//     'outlook.com',
//     'aol.com',
//     'icloud.com',
//     'protonmail.com',
//     'proton.me',
//     'zoho.com',
//     'mail.com',
//     'gmx.com',
//     'yandex.com',
//     'microsoft.com',
//     'googlemail.com',
//     'live.com',
//   ]);

//   constructor(
//     private readonly configService: ConfigService,
//     private readonly formatValidator: FormatValidatorService,
//     private readonly roleBasedService: RoleBasedService,
//     private readonly disposableDomainService: DisposableDomainService,
//     private readonly domainCheckService: DomainCheckService,
//     private readonly mxCheckService: MxCheckService,
//     private readonly smtpCheckService: SmtpCheckService,
//     private readonly catchAllService: CatchAllService,
//     private readonly scoringService: ScoringService,
//   ) {
//     this.scoreThreshold = this.configService.get<number>(
//       'EMAIL_VERIFICATION_SCORE_THRESHOLD',
//       70,
//     );
//     this.enableDetailedLogs = this.configService.get<boolean>(
//       'EMAIL_VERIFICATION_DEBUG',
//       false,
//     );
//   }

//   async verifyEmail(email: string): Promise<VerificationResult> {
//     const startTime = Date.now();
//     const result: VerificationResult = {
//       isValid: false,
//       checks: {
//         formatValid: false,
//         disposable: false,
//         domainExists: false,
//         hasMxRecord: false,
//         smtpValid: false,
//         catchAll: false,
//       },
//       score: 0,
//       details: {
//         verificationStarted: new Date().toISOString(),
//       },
//     };

//     try {
//       this.logVerificationStep('Starting verification', { email });

//       // Step 1: Format Validation
//       result.checks.formatValid = this.formatValidator.isValidFormat(email);
//       if (!result.checks.formatValid) {
//         return this.finalizeResult(result, 'Invalid email format');
//       }

//       const [localPart, domain] = email.split('@');
//       const punycodeDomain = punycode.toASCII(domain);

//       // Step 2: Role-based Check
//       if (this.roleBasedService.isRoleBasedEmail(localPart)) {
//         result.score -= 20;
//         result.details.roleBasedEmail = true;
//       }

//       // Step 3: Disposable Domain Check
//       result.checks.disposable =
//         await this.disposableDomainService.isDisposableDomain(punycodeDomain);
//       if (result.checks.disposable) {
//         return this.finalizeResult(result, 'Disposable email domain');
//       }

//       // Step 4: Domain Existence Check
//       result.checks.domainExists =
//         await this.domainCheckService.checkDomainExists(punycodeDomain);
//       if (!result.checks.domainExists) {
//         return this.finalizeResult(result, 'Domain does not exist');
//       }

//       // Step 5: MX Record Check
//       result.checks.hasMxRecord =
//         await this.mxCheckService.hasMxRecord(punycodeDomain);
//       if (!result.checks.hasMxRecord) {
//         return this.finalizeResult(result, 'No MX records found');
//       }

//       // Step 6: Provider-specific Handling
//       const isWellKnown = this.isWellKnownProvider(punycodeDomain);
//       if (isWellKnown) {
//         result.checks.smtpValid = true;
//         result.score += 30;
//         result.details.provider = 'well-known';
//         this.logVerificationStep(
//           'Well-known provider detected, skipping SMTP check',
//           { domain: punycodeDomain },
//         );
//       } else {
//         // Step 7: Full SMTP Verification
//         try {
//           const smtpResult = await this.performEnhancedSmtpCheck(
//             punycodeDomain,
//             localPart,
//           );
//           this.processSmtpResult(result, smtpResult);

//           // Step 8: Catch-all Detection (only if SMTP is valid)
//           if (smtpResult.isValid && !result.checks.catchAll) {
//             result.checks.catchAll =
//               await this.catchAllService.isCatchAll(punycodeDomain);
//             if (result.checks.catchAll) {
//               result.score -= 15;
//               result.details.catchAll = true;
//               this.logVerificationStep('Catch-all domain detected', {
//                 domain: punycodeDomain,
//               });
//             }
//           }
//         } catch (smtpError) {
//           this.handleSmtpError(result, smtpError);
//         }
//       }

//       // Calculate final scoring and result
//       return this.finalizeResult(result);
//     } catch (error) {
//       this.logger.error(`Verification failed for ${email}: ${error.message}`, {
//         stack: error.stack,
//         email,
//       });

//       return this.finalizeResult(result, 'Verification process failed', {
//         error: error.message,
//         errorType: error.name,
//       });
//     } finally {
//       result.details.verificationDuration = Date.now() - startTime;
//       this.logVerificationStep('Verification completed', {
//         email,
//         duration: result.details.verificationDuration,
//         isValid: result.isValid,
//         score: result.score,
//       });
//     }
//   }

//   private async performEnhancedSmtpCheck(
//     domain: string,
//     localPart: string,
//   ): Promise<SmtpVerificationResult> {
//     this.logVerificationStep('Starting SMTP verification', {
//       domain,
//       localPart,
//     });

//     try {
//       const isValid = await this.smtpCheckService.performSmtpVerification(
//         domain,
//         localPart,
//       );
//       let confidence: 'high' | 'medium' | 'low' = 'high';
//       let catchAllStatus = false;

//       if (isValid) {
//         try {
//           const randomEmail = `test${Date.now()}${Math.random().toString(36).substring(7)}`;
//           catchAllStatus = await this.smtpCheckService.performSmtpVerification(
//             domain,
//             randomEmail,
//           );
//           confidence = catchAllStatus ? 'low' : 'high';
//         } catch (error) {
//           confidence = 'medium';
//           this.logger.debug(
//             `Catch-all check failed for ${domain}: ${error.message}`,
//           );
//         }
//       }

//       return {
//         isValid,
//         confidence,
//         details: {
//           catchAll: catchAllStatus,
//           protocol: isValid ? 'SMTP' : undefined,
//           timestamp: new Date().toISOString(),
//         },
//       };
//     } catch (error) {
//       this.logger.error(
//         `SMTP check error for ${localPart}@${domain}: ${error.message}`,
//       );
//       throw error;
//     }
//   }

//   private processSmtpResult(
//     result: VerificationResult,
//     smtpResult: SmtpVerificationResult,
//   ): void {
//     result.checks.smtpValid = smtpResult.isValid;
//     result.details.smtp = smtpResult.details;

//     if (smtpResult.isValid) {
//       switch (smtpResult.confidence) {
//         case 'high':
//           result.score += 30;
//           break;
//         case 'medium':
//           result.score += 20;
//           break;
//         case 'low':
//           result.score += 10;
//           break;
//       }
//     }
//   }

//   private handleSmtpError(result: VerificationResult, error: Error): void {
//     this.logger.error(`SMTP verification error: ${error.message}`, error.stack);

//     result.checks.smtpValid = false;
//     result.details.smtp = {
//       error: error.message,
//       errorType: error['code'] || 'UNKNOWN',
//       timestamp: new Date().toISOString(),
//     };
//     result.score -= 10;
//   }

//   private finalizeResult(
//     result: VerificationResult,
//     reason?: string,
//     additionalDetails: Record<string, any> = {},
//   ): VerificationResult {
//     // Add any provided reason and details
//     if (reason) {
//       result.reason = reason;
//     }
//     result.details = { ...result.details, ...additionalDetails };

//     // Calculate final score
//     const scoredResult = this.scoringService.calculateScore(result);

//     // Determine final validity based on score threshold
//     scoredResult.isValid =
//       scoredResult.checks.formatValid &&
//       !scoredResult.checks.disposable &&
//       scoredResult.checks.hasMxRecord &&
//       scoredResult.score >= this.scoreThreshold;

//     // Add verification completion timestamp
//     scoredResult.details.verificationCompleted = new Date().toISOString();

//     return scoredResult;
//   }

//   private isWellKnownProvider(domain: string): boolean {
//     const domainBase = domain.toLowerCase();
//     return (
//       this.wellKnownDomains.has(domainBase) ||
//       Array.from(this.wellKnownDomains).some((known) =>
//         domainBase.endsWith('.' + known),
//       )
//     );
//   }

//   private logVerificationStep(
//     message: string,
//     context: Record<string, any>,
//   ): void {
//     if (this.enableDetailedLogs) {
//       this.logger.debug(`[Email Verification] ${message}`, context);
//     }
//   }
// }
