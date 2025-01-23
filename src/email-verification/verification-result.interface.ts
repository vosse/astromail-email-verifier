export interface VerificationChecks {
  formatValid: boolean;
  disposable: boolean;
  domainExists: boolean;
  hasMxRecord: boolean;
  smtpValid: boolean;
  catchAll: boolean;
}

export interface VerificationResult {
  isValid: boolean;
  checks: VerificationChecks;
  score: number;
  reason?: string;
}

// src/email-verification/interfaces/verification-result.interface.ts
// export interface VerificationResult {
//   isValid: boolean;
//   checks: {
//     formatValid: boolean;
//     disposable: boolean;
//     domainExists: boolean;
//     hasMxRecord: boolean;
//     smtpValid: boolean;
//     catchAll: boolean;
//   };
//   score: number;
//   reason?: string;
//   details: {
//     verificationStarted?: string;
//     verificationCompleted?: string;
//     verificationDuration?: number;
//     provider?: string;
//     roleBasedEmail?: boolean;
//     smtp?: {
//       serverResponse?: string;
//       port?: number;
//       protocol?: string;
//       error?: string;
//       errorType?: string;
//       timestamp?: string;
//     };
//     catchAll?: boolean;
//     error?: string;
//     errorType?: string;
//   };
// }

// src/email-verification/interfaces/smtp-verification-result.interface.ts
export interface SmtpVerificationResult {
  isValid: boolean;
  confidence: 'high' | 'medium' | 'low';
  details: {
    serverResponse?: string;
    port?: number;
    protocol?: string;
    catchAll?: boolean;
    error?: string;
    errorType?: string;
    timestamp: string;
  };
}
