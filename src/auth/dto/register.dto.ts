import { IsString, IsEmail, IsOptional, MinLength } from 'class-validator';
import { PASSWORD_MIN_LENGTH } from '../password-policy';

export class RegisterDto {
  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  password: string;

  @IsString()
  inviteToken: string;

  @IsString()
  @IsOptional()
  accountingEmail?: string;

  @IsEmail()
  @IsOptional()
  hrEmail?: string;

  @IsEmail()
  @IsOptional()
  directorEmail?: string;
}
