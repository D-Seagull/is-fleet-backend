import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** "Start free trial" from the landing page: creates a company and mails its invite link. */
export class TrialSignupDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  companyName: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  trucks?: string;

  /** Honeypot — hidden on the form, so only bots fill it in. */
  @IsOptional()
  @IsString()
  website?: string;
}
