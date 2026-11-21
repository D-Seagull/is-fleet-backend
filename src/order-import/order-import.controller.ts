import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { JwtUser } from '../auth/interfaces/jwt-user.interface';
import { UploadInterceptor } from '../common/upload.interceptor';
import { OrderImportService } from './order-import.service';
import { OrderFilesService } from './order-files.service';
import { TripFinanceDto, TripFinanceService } from './trip-finance.service';

const MINUTE = 60_000;

export class ParseOrderDto {
  /** Order text pasted from an e-mail, when no file is sent. */
  @IsOptional()
  @IsString()
  @MaxLength(60_000)
  text?: string;

  /** The manager's UI language for review notes ("uk", "en", "pl"…). */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;

  /** The driver chosen in the form: the notes are written in their language. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  driverId?: string;
}

/** Managers only: a driver never parses, sees or downloads an order. */
@ApiTags('order-import')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
@Controller()
export class OrderImportController {
  constructor(
    private orderImport: OrderImportService,
    private orderFiles: OrderFilesService,
    private tripFinance: TripFinanceService,
  ) {}

  /** Whether "fill from order" is switched on here (the web hides the button if not). */
  @Get('order-import/status')
  status() {
    return { enabled: this.orderImport.enabled };
  }

  /**
   * File (multipart "file") or pasted text → draft for the new-trip form.
   * Stores nothing. Each call is a paid model request, hence its own limit.
   */
  @Post('order-import/parse')
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @UseInterceptors(UploadInterceptor('file', 'order', { single: true }))
  parse(
    @GetUser() user: JwtUser,
    @Body() dto: ParseOrderDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const text = dto.text?.trim();
    if (!file && !text) throw new BadRequestException('errors.orderEmpty');
    return this.orderImport.parse(
      file
        ? {
            kind: 'file',
            buffer: file.buffer,
            fileName: file.originalname,
            mimeType: file.mimetype,
          }
        : { kind: 'text', text: text! },
      {
        userId: user.id,
        companyId: user.companyId ?? null,
        locale: dto.locale || acceptLanguage?.split(',')[0],
        driverId: dto.driverId,
      },
    );
  }

  @Post('trips/:id/order')
  @UseInterceptors(UploadInterceptor('file', 'order', { single: true }))
  upload(
    @Param('id') tripId: string,
    @GetUser() user: JwtUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.orderFiles.upload(tripId, user, file);
  }

  @Get('trips/:id/order')
  current(@Param('id') tripId: string, @GetUser() user: JwtUser) {
    return this.orderFiles.current(tripId, user);
  }

  /** Freight, km, tolls — null when the trip has none yet. */
  @Get('trips/:id/finance')
  finance(@Param('id') tripId: string, @GetUser() user: JwtUser) {
    return this.tripFinance.get(tripId, user);
  }

  @Put('trips/:id/finance')
  saveFinance(
    @Param('id') tripId: string,
    @GetUser() user: JwtUser,
    @Body() dto: TripFinanceDto,
  ) {
    return this.tripFinance.put(tripId, user, dto);
  }

  @Delete('trips/:id/order')
  remove(@Param('id') tripId: string, @GetUser() user: JwtUser) {
    return this.orderFiles.remove(tripId, user);
  }
}
