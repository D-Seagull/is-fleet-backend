import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Language } from '@prisma/client';

/**
 * Generic user-profile patch — covers driver-side fields (phone, language,
 * managerId, truckId) AND manager-side fields (firstName/lastName, teamleadId).
 * Naming kept as "UpdateDriverDto" for now to avoid touching every caller,
 * but it works for any role on PATCH /users/:id.
 */
export class UpdateDriverDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string | null;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  @IsString()
  @IsOptional()
  managerId?: string | null;

  @IsString()
  @IsOptional()
  teamleadId?: string | null;

  @IsString()
  @IsOptional()
  truckId?: string | null;
}
