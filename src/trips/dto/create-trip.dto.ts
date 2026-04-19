import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TripStopDto {
  @IsEnum(['LOADING', 'UNLOADING'])
  type: 'LOADING' | 'UNLOADING';

  @IsInt()
  @IsOptional()
  order?: number;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  ref?: string;

  @IsString()
  @IsOptional()
  coords?: string;
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripStopDto)
  @IsOptional()
  stops?: TripStopDto[];
}
