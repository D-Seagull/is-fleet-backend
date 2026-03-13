import { IsString, IsOptional, IsEnum, IsEmail } from 'class-validator';
import { Language } from '@prisma/client';

export class CreateDriverDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsEnum(Language as object)
  @IsOptional()
  language?: Language;
}
