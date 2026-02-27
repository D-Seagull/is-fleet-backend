import { IsString, IsOptional } from 'class-validator';

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
}
