export interface VerificationResult {
  emailAddress: string;
  emailStatus: 'Valid' | 'Invalid' | 'Catch-All';
  domain: string;
  emailSyntaxFormat: 'Valid' | 'Invalid';
  mailboxType: 'Professional' | 'Webmail';
  mailboxServerStatus: 'Valid' | 'Invalid';
  technicalDetails?: {
    disposable: boolean;
    domainExists: boolean;
    hasMxRecord: boolean;
    smtpValid: boolean;
    catchAll: boolean;
  };
}
