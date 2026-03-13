import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min } from 'class-validator';

export class CreateAdvanceRequestDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  reason: string;
}
