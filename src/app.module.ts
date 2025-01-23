import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EmailVerificationModule } from './email-verification/email-verification.module';

@Module({
  imports: [EmailVerificationModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
