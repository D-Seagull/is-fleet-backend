import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  IsInt,
  IsUUID,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { trimOrderNumber } from 'src/common/utils/order-number';

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

  @Transform(trimOrderNumber)
  @IsString()
  @IsOptional()
  orderNumber?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripStopDto)
  @IsOptional()
  stops?: TripStopDto[];

  // "Fill from order": one key per draft. Sending it again (double click,
  // retry after a timeout) returns the trip it already made.
  @IsUUID()
  @IsOptional()
  importKey?: string;
}
