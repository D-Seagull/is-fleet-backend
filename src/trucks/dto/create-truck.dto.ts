import { IsString, IsOptional } from 'class-validator';

export class CreateTruckDto {
  @IsString()
  plate: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
