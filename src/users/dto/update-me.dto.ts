import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { Language, UILocale, UserStatus } from '@prisma/client';

/**
 * Self-update DTO — what a user is allowed to change on their own row via
 * PATCH /users/me. Deliberately narrower than UpdateDriverDto: nobody gets
 * to reassign their own manager / teamlead / truck through this route.
 */
export class UpdateMeDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string | null;

  @IsString()
  @Matches(/^\+?[\d\s\-()]{8,20}$/, {
    message: 'Phone must be in international format, e.g. +380501234567',
  })
  @IsOptional()
  phone?: string;

  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  /** UI locale preference — which messages/*.json the app renders. */
  @IsOptional()
  @IsEnum(UILocale)
  uiLocale?: UILocale;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  /**
   * ISO timestamp at which a BUSY/SLEEP state should auto-clear. Pass
   * `null` (or omit) for indefinite. Server ignores `statusUntil` when
   * `status` is ONLINE.
   */
  @IsOptional()
  @IsDateString()
  statusUntil?: string | null;
}
