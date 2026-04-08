import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { Language } from '@prisma/client';

export class CreateDispatcherDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsEnum(Language)
  language?: Language;
}
