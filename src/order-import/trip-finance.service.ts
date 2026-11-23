import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { assertTripAccess, type Requester } from '../common/utils/access';

/** Whole replacement of a trip's money side; null clears a field. */
export class TripFinanceDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999)
  freightRate?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[A-Z]{3}$/)
  currency?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  loadedKm?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  emptyKm?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999)
  tolls?: number | null;
}

const SELECT = {
  freightRate: true,
  currency: true,
  loadedKm: true,
  emptyKm: true,
  tolls: true,
  updatedAt: true,
} as const;

type Row = Prisma.TripFinanceGetPayload<{ select: typeof SELECT }>;

/**
 * Freight, kilometres and tolls of a trip — managers only (the controller's
 * @Roles). Kept out of every trip query so it never reaches a driver.
 */
@Injectable()
export class TripFinanceService {
  constructor(private prisma: PrismaService) {}

  async get(tripId: string, requester: Requester) {
    await assertTripAccess(this.prisma, tripId, requester);
    const row = await this.prisma.tripFinance.findUnique({
      where: { tripId },
      select: SELECT,
    });
    return row ? toJson(row) : null;
  }

  async put(tripId: string, requester: Requester, dto: TripFinanceDto) {
    await assertTripAccess(this.prisma, tripId, requester);
    const data = {
      freightRate: dto.freightRate ?? null,
      currency: dto.currency ?? null,
      loadedKm: dto.loadedKm ?? null,
      emptyKm: dto.emptyKm ?? null,
      tolls: dto.tolls ?? null,
      updatedById: requester.id,
    };
    const row = await this.prisma.tripFinance.upsert({
      where: { tripId },
      create: { tripId, ...data },
      update: data,
      select: SELECT,
    });
    return toJson(row);
  }
}

/** Prisma Decimal → plain number for the client. */
function toJson(row: Row) {
  return {
    ...row,
    freightRate: row.freightRate === null ? null : Number(row.freightRate),
    tolls: row.tolls === null ? null : Number(row.tolls),
  };
}
