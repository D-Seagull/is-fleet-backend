import { IsEnum, IsOptional, IsArray, ValidateNested, IsString, IsInt } from 'class-validator';
import { TripStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class UpdateStopDto {
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

export class UpdateTripDto {
  @IsEnum(TripStatus)
  @IsOptional()
  status?: TripStatus;

  @IsString()
  @IsOptional()
  notes?: string;

  // replaces all stops on update
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateStopDto)
  @IsOptional()
  stops?: UpdateStopDto[];
}
