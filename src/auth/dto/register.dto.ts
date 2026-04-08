import { IsString, IsEmail, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsOptional()
  name?: string;

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
