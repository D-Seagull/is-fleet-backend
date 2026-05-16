import { IsString, IsOptional } from 'class-validator';

export class UpdateDriverDto {
  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  managerId?: string | null;

  @IsString()
  @IsOptional()
  truckId?: string | null;
}
