import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
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
    message: 'errors.phoneFormat',
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

  /**
   * Deprecated and ignored. Installed web / is-manager builds still send it
   * after their "this driver exists elsewhere" prompt, which the server no
   * longer shows (audit P1-6: the phone owner is never revealed) — a number
   * registered with another company always gets the consent SMS directly.
   */
  @IsBoolean()
  @IsOptional()
  confirmTransfer?: boolean;
}
