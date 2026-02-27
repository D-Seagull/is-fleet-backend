import { IsEnum, IsOptional } from 'class-validator';
import { TripStatus } from '@prisma/client';

export class UpdateTripDto {
  @IsEnum(TripStatus)
  @IsOptional()
  status?: TripStatus;
}
