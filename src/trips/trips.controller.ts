import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('trips')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('trips')
export class TripsController {
  constructor(private tripsService: TripsService) {}

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Post()
  create(
    @GetUser('companyId') companyId: string,
    @GetUser('id') dispatcherId: string,
    @Body() dto: CreateTripDto,
  ) {
    return this.tripsService.create(companyId, dispatcherId, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Get()
  findAll(@GetUser('companyId') companyId: string) {
    return this.tripsService.findAll(companyId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Get(':id')
  findOne(@Param('id') id: string, @GetUser('companyId') companyId: string) {
    return this.tripsService.findOne(id, companyId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @GetUser('companyId') companyId: string,
    @Body() dto: UpdateTripDto,
  ) {
    return this.tripsService.updateStatus(id, companyId, dto);
  }

  @Roles('ADMIN', 'DRIVER')
  @Patch(':id/driver-status')
  driverUpdateStatus(
    @Param('id') id: string,
    @GetUser('id') driverId: string,
    @Body() dto: UpdateTripDto,
  ) {
    return this.tripsService.driverUpdateStatus(id, driverId, dto);
  }
  @Roles('ADMIN', 'TEAMLEAD')
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @GetUser('companyId') companyId: string,
  ) {
    return this.tripsService.remove(id, companyId);
  }
}
