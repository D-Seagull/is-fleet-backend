import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Company-wide profile patch — what a TEAMLEAD edits from the Settings page.
 * Anything left undefined is left unchanged; passing an explicit empty
 * string for an email clears that contact (validated as @IsEmail when
 * present, otherwise allowed to be null/empty).
 */
export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

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
