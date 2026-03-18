import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  companyName: string;

  @IsEmail()
  @IsOptional()
  accountingEmail?: string;

  @IsEmail()
  @IsOptional()
  hrEmail?: string;

  @IsEmail()
  @IsOptional()
  directorEmail?: string;
}
