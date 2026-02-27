import { IsString, IsOptional } from 'class-validator';
import { TruckStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateTruckDto {
  @IsString()
  @IsOptional()
  plate?: string;

  @IsEnum(TruckStatus)
  @IsOptional()
  status?: TruckStatus;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  currentDriverId?: string;
}
