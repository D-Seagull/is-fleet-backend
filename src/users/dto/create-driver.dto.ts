import { IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { Language } from '@prisma/client';

export class CreateDriverDto {
  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @Matches(/^\+?[\d\s\-()]{8,20}$/, {
    message: 'Phone must be in international format, e.g. +380501234567',
  })
  phone: string;

  /**
   * Optional. Drivers normally log in via SMS OTP from the mobile app, so a
   * password isn't needed. Kept here for legacy/admin use only.
   */
  @IsString()
  @IsOptional()
  password?: string;

  @IsEnum(Language as object)
  @IsOptional()
  language?: Language;
}
