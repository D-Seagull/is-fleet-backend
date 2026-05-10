import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AlarmRecurrence } from '@prisma/client';

export class UpdateAlarmDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;

  @IsDateString()
  @IsOptional()
  time?: string;

  @IsEnum(AlarmRecurrence)
  @IsOptional()
  recurrence?: AlarmRecurrence;
}
