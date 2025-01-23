import { Injectable } from '@nestjs/common';

@Injectable()
export class RoleBasedService {
  // Moved from the main service
  private readonly roleBasedEmails = new Set([
    'admin',
    'administrator',
    'webmaster',
    'hostmaster',
    'postmaster',
    'info',
    'support',
    'sales',
    'marketing',
    'contact',
    'help',
    'abuse',
    'noreply',
    'no-reply',
    'mail',
    'email',
    'office',
  ]);

  isRoleBasedEmail(localPart: string): boolean {
    return this.roleBasedEmails.has(localPart.toLowerCase());
  }
}
