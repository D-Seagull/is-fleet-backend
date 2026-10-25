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

/** "Book a demo" from the landing page: forwarded to the sales inbox. */
export class DemoRequestDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  company: string;

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

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  /** Honeypot — hidden on the form, so only bots fill it in. */
  @IsOptional()
  @IsString()
  website?: string;
}
