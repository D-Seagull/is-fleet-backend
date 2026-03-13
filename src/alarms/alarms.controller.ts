import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AlarmsService } from './alarms.service';
import { CreateAlarmDto } from './dto/create-alarm.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('alarms')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('alarms')
export class AlarmsController {
  constructor(private alarmsService: AlarmsService) {}

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Post()
  create(@GetUser('id') dispatcherId: string, @Body() dto: CreateAlarmDto) {
    return this.alarmsService.create(dispatcherId, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Get('trip/:tripId')
  findByTrip(@Param('tripId') tripId: string) {
    return this.alarmsService.findByTrip(tripId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.alarmsService.remove(id);
  }
}
