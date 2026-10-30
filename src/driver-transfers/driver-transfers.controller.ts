import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { authThrottle } from 'src/common/throttle';
import { DriverTransfersService } from './driver-transfers.service';

class TransferTokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(128)
  token: string;
}

/**
 * Public consent page for a cross-company driver transfer (link from the
 * SMS). The token travels in the body, not the path, so it never lands in
 * request logs.
 */
@ApiTags('public')
@Controller('public/driver-transfer')
export class DriverTransfersController {
  constructor(private transfers: DriverTransfersService) {}

  @Throttle(authThrottle('token', 10, 30))
  @HttpCode(200)
  @Post('lookup')
  lookup(@Body() dto: TransferTokenDto) {
    return this.transfers.lookup(dto.token);
  }

  @Throttle(authThrottle('token', 5, 30))
  @HttpCode(200)
  @Post('accept')
  accept(@Body() dto: TransferTokenDto) {
    return this.transfers.accept(dto.token);
  }

  @Throttle(authThrottle('token', 5, 30))
  @HttpCode(200)
  @Post('decline')
  decline(@Body() dto: TransferTokenDto) {
    return this.transfers.decline(dto.token);
  }
}
