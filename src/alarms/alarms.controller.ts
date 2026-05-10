import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AlarmsService } from './alarms.service';
import { CreateAlarmDto } from './dto/create-alarm.dto';
import { UpdateAlarmDto } from './dto/update-alarm.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('alarms')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('alarms')
export class AlarmsController {
  constructor(private alarmsService: AlarmsService) {}

  /** Create an alarm. Drivers may only target themselves; managers can
   *  target any user from the same company. */
  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Post()
  create(
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
    @GetUser('companyId') companyId: string,
    @Body() dto: CreateAlarmDto,
  ) {
    return this.alarmsService.create(userId, role, companyId, dto);
  }

  /** Alarms targeted at the current user — their personal inbox. */
  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Get('my')
  findMy(@GetUser('id') userId: string) {
    return this.alarmsService.findMy(userId);
  }

  /** Alarms the current user has scheduled. */
  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Get('created')
  findCreated(@GetUser('id') userId: string) {
    return this.alarmsService.findCreated(userId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Get('trip/:tripId')
  findByTrip(
    @Param('tripId') tripId: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
    @GetUser('companyId') companyId: string,
  ) {
    return this.alarmsService.findByTrip(tripId, {
      id: userId,
      role,
      companyId,
    });
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Get('truck/:truckId')
  findByTruck(
    @Param('truckId') truckId: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
    @GetUser('companyId') companyId: string,
  ) {
    return this.alarmsService.findByTruck(truckId, {
      id: userId,
      role,
      companyId,
    });
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @Body() dto: UpdateAlarmDto,
  ) {
    return this.alarmsService.update(id, userId, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Delete(':id')
  remove(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.alarmsService.remove(id, userId);
  }
}
