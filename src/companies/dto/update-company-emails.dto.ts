import { IsEmail, IsOptional, ValidateIf } from 'class-validator';

/**
 * `PATCH /companies/emails` body. A real class (not an inline type) so the
 * global ValidationPipe whitelists it — an inline object literal skips
 * validation entirely and the raw body used to reach `company.update`
 * (nested writes → escalation to ADMIN). Empty string / null clears a contact.
 */
export class UpdateCompanyEmailsDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsEmail()
  accountingEmail?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsEmail()
  hrEmail?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsEmail()
  directorEmail?: string | null;
}
