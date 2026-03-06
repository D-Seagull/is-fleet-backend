import { IsString, IsDateString, IsOptional } from 'class-validator';

export class CreateAlarmDto {
  @IsString()
  tripId: string;

  @IsString()
  driverId: string;

  @IsDateString()
  time: string;

  @IsString()
  @IsOptional()
  note?: string;
}
