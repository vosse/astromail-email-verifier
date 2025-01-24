// import { Injectable } from '@nestjs/common';
// import { VerificationResult } from './verification-result.interface';

// @Injectable()
// export class ScoringService {
//   // Adjust these weights to fine-tune scoring
//   private readonly BASE_FORMAT = 20;
//   private readonly BASE_NOT_DISPOSABLE = 20;
//   private readonly BASE_DOMAIN_EXISTS = 20;
//   private readonly BASE_HAS_MX = 20;
//   private readonly BASE_SMTP_VALID = 20;
//   private readonly BASE_NO_CATCH_ALL = 10;
//   private readonly VALID_THRESHOLD = 70;

//   calculateScore(result: VerificationResult): VerificationResult {
//     let score = 0;

//     if (result.checks.formatValid) score += this.BASE_FORMAT;
//     if (!result.checks.disposable) score += this.BASE_NOT_DISPOSABLE;
//     if (result.checks.domainExists) score += this.BASE_DOMAIN_EXISTS;
//     if (result.checks.hasMxRecord) score += this.BASE_HAS_MX;
//     if (result.checks.smtpValid) score += this.BASE_SMTP_VALID;
//     if (!result.checks.catchAll) score += this.BASE_NO_CATCH_ALL;

//     // Add any externally updated score modifications (e.g., from role-based)
//     score += result.score;

//     // Clamp to [0, 100]
//     result.score = Math.max(0, Math.min(100, score));

//     result.isValid =
//       result.score >= this.VALID_THRESHOLD &&
//       result.checks.formatValid &&
//       !result.checks.disposable &&
//       result.checks.hasMxRecord &&
//       result.checks.smtpValid;

//     return result;
//   }
// }
