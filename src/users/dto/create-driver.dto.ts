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
   * Set when the manager has already seen the "this driver exists in
   * another company" prompt and confirmed the move. Without it, a phone
   * match against a driver in a different company returns 409 with the
   * existing driver's name instead of creating/transferring anything.
   */
  @IsBoolean()
  @IsOptional()
  confirmTransfer?: boolean;
}
