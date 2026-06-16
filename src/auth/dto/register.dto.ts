import { IsString, IsEmail, IsOptional, MinLength } from 'class-validator';

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
