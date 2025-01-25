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
// import { CatchAllService } from './catch-all.service';
// import { ScoringService } from './scoring.service';
import { join } from 'path';
import { promisify } from 'util';
import * as fs from 'fs';

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
    // private readonly catchAllService: CatchAllService,
    // private readonly scoringService: ScoringService,
  ) {}

  private readonly readFileAsync = promisify(fs.readFile);

  private webmailDomainsCache: Record<string, boolean> | null = null;

  private async loadWebmailDomains(): Promise<Record<string, boolean>> {
    if (this.webmailDomainsCache) {
      return this.webmailDomainsCache;
    }

    try {
      const filePath = join(__dirname, '../..', 'webmail_domains.json');
      const content = await this.readFileAsync(filePath, 'utf8');
      this.webmailDomainsCache = JSON.parse(content);
      return this.webmailDomainsCache;
    } catch (error) {
      this.logger.error(
        `Failed to load webmail domains: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return {};
    }
  }

  private async isWebmailDomain(domain: string): Promise<boolean> {
    const domainBase = domain.toLowerCase().trim();
    const domains = await this.loadWebmailDomains();
    return !!domains[domainBase];
  }

  async verifyEmail(email: string): Promise<VerificationResult> {
    const [localPart, domain] = email.split('@');
    const punycodeDomain = punycode.toASCII(domain);

    const result: VerificationResult = {
      emailAddress: email,
      emailStatus: 'Invalid',
      domain: domain,
      emailSyntaxFormat: 'Invalid',
      mailboxType: 'Professional',
      mailboxServerStatus: 'Invalid',
      technicalDetails: {
        disposable: false,
        domainExists: false,
        hasMxRecord: false,
        smtpValid: false,
        catchAll: false,
      },
    };

    try {
      // 1. Format Validation
      result.emailSyntaxFormat = this.formatValidator.isValidFormat(email)
        ? 'Valid'
        : 'Invalid';
      if (result.emailSyntaxFormat === 'Invalid') {
        return result;
      }

      // // 2. Role-based check
      // result.mailboxType = this.roleBasedService.isRoleBasedEmail(localPart)
      //   ? 'Role-Based'
      //   : 'Professional';

      // 3. Disposable domain check
      result.technicalDetails.disposable =
        await this.disposableDomainService.isDisposableDomain(punycodeDomain);
      if (result.technicalDetails.disposable) {
        return result;
      }

      // 4. Domain check
      result.technicalDetails.domainExists =
        await this.domainCheckService.checkDomainExists(punycodeDomain);
      if (!result.technicalDetails.domainExists) {
        return result;
      }

      // 5. MX check
      result.technicalDetails.hasMxRecord =
        await this.mxCheckService.hasMxRecord(punycodeDomain);
      if (!result.technicalDetails.hasMxRecord) {
        return result;
      }

      const isDisposable =
        await this.disposableDomainService.isDisposableDomain(punycodeDomain);
      const isWebmail = await this.isWebmailDomain(punycodeDomain);

      this.logger.debug('IS WEBMAIL?: ', isWebmail);

      result.mailboxType =
        !isDisposable && !isWebmail ? 'Professional' : 'Webmail';

      // 6. Well-known providers
      if (this.isWellKnownProvider(punycodeDomain)) {
        result.mailboxServerStatus = 'Valid';
        result.emailStatus = 'Valid';
        result.technicalDetails.smtpValid = true;
      } else {
        // 7. Perform SMTP check
        const { smtp, catchall } = await this.smtpCheckService.isEmailValid(
          punycodeDomain,
          localPart,
        );

        // const smtp = true;
        // const catchall = false;

        result.technicalDetails.smtpValid = smtp;
        result.technicalDetails.catchAll = catchall;
        result.mailboxServerStatus = smtp ? 'Valid' : 'Invalid';

        if (catchall) {
          result.emailStatus = 'Catch-All';
        } else if (smtp) {
          result.emailStatus = 'Valid';
        } else {
          result.emailStatus = 'Invalid';
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`Verification failed for ${email}: ${error.message}`);
      return result;
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
