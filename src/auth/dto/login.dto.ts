import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  /** "Remember me" — when false, the refresh cookie is session-only (dropped
   *  on browser close) instead of persisting for 30 days. Defaults to true. */
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
