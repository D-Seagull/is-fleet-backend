import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AlarmRecurrence } from '@prisma/client';

export class CreateAlarmDto {
  /** Хто має отримати нагадування. Може бути сам creator або користувач
   *  з тієї ж компанії. Дисп може встановлювати водіям; водій — тільки собі. */
  @IsString()
  targetUserId: string;

  @IsString()
  @MaxLength(120)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;

  @IsDateString()
  time: string;

  /** Опційно: прив'язати до конкретного тріпа. */
  @IsString()
  @IsOptional()
  tripId?: string;

  /** За замовчуванням NONE — спрацює один раз. */
  @IsEnum(AlarmRecurrence)
  @IsOptional()
  recurrence?: AlarmRecurrence;
}
