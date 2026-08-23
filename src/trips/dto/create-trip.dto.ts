import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  IsInt,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TripStopDto {
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

  // Планове вікно завантаження/вивантаження (рядки, без конвертації TZ).
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

export class CreateTripDto {
  @IsString()
  title: string;

  @IsString()
  driverId: string;

  @IsString()
  truckId: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  orderNumber?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripStopDto)
  @IsOptional()
  stops?: TripStopDto[];
}
