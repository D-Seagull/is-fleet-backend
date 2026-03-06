import { IsOptional, IsString } from 'class-validator';

export class CreateTruckDto {
  @IsString()
  plate: string;

  @IsString()
  @IsOptional()
  currentDriverId?: string;
}
