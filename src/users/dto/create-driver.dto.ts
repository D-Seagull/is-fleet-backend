import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Language } from '@prisma/client';

export class CreateDriverDto {
  @IsString()
  name: string;

  @IsString()
  phone: string;

  @IsEnum(Language as object)
  @IsOptional()
  language?: Language;
}
