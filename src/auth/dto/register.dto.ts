import { IsString, IsEmail, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsString()
  inviteToken: string; // обов'язковий — без токена не можна зареєструватись

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
