import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EmailVerificationService } from './email-verification.service';
import { FormatValidatorService } from './format-validator.service';
import { RoleBasedService } from './role-based.service';
import { DisposableDomainService } from './disposable-domain.service';
import { DomainCheckService } from './domain-check.service';
import { MxCheckService } from './mx-check.service';
import { SmtpCheckService } from './smtp-check.service';
import { CatchAllService } from './catch-all.service';
import { ScoringService } from './scoring.service';
import { EmailVerificationController } from './email-verification.controller';

@Module({
  controllers: [EmailVerificationController],
  providers: [
    ConfigService,
    EmailVerificationService,
    FormatValidatorService,
    RoleBasedService,
    DisposableDomainService,
    DomainCheckService,
    MxCheckService,
    SmtpCheckService,
    CatchAllService,
    ScoringService,
  ],
  exports: [EmailVerificationService], // Export so other modules can use
})
export class EmailVerificationModule {}
