import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { Language } from '@prisma/client';

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
}
