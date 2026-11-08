import { BillingStatus } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Every field is optional; `null` clears price / pilot end / note. */
export class UpdateBillingDto {
  @IsOptional()
  @IsEnum(BillingStatus)
  billingStatus?: BillingStatus;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  pricePerTruck?: number | null;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsISO8601()
  pilotEndsAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNote?: string | null;
}
