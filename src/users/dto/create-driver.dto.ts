import { IsString, IsOptional, IsEnum } from 'class-validator';
import { Language } from '@prisma/client';

export class CreateDriverDto {
  @IsString()
  name: string;

  @IsString()
  phone: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsEnum(Language as object)
  @IsOptional()
  language?: Language;
}
