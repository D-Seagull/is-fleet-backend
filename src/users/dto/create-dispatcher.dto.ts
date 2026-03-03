import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { Language } from '@prisma/client';

export class CreateDispatcherDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(Language)
  language?: Language;
}
