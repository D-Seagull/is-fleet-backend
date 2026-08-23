import { IsEnum, IsOptional, IsArray, ValidateNested, IsString, IsInt, Matches } from 'class-validator';
import { TripStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class AssignTripDto {
  @IsString()
  driverId: string;
}

export class AssignManagerDto {
  @IsString()
  managerId: string;
}

export class UpdateStopDto {
  @IsEnum(['LOADING', 'UNLOADING', 'WAYPOINT'])
  type: 'LOADING' | 'UNLOADING' | 'WAYPOINT';

  @IsInt()
  @IsOptional()
  order?: number;

  // мітка для проміжного пункту (WAYPOINT), напр. "Кастомс"
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  ref?: string;

  @IsString()
  @IsOptional()
  coords?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  windowDate?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  windowStart?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  windowEnd?: string;
}

export class UpdateTripDto {
  @IsEnum(TripStatus)
  @IsOptional()
  status?: TripStatus;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  orderNumber?: string;

  // replaces all stops on update
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateStopDto)
  @IsOptional()
  stops?: UpdateStopDto[];
}
