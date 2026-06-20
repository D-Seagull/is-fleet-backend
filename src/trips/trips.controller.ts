import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { GetTripMessagesDto } from './dto/get-trip-messages.dto';
import {
  AssignManagerDto,
  AssignTripDto,
  UpdateTripDto,
} from './dto/update-trip.dto';
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

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Post()
  create(
    @GetUser('companyId') companyId: string,
    @GetUser('id') managerId: string,
    @Body() dto: CreateTripDto,
  ) {
    return this.tripsService.create(companyId, managerId, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Get()
  findAll(@GetUser('companyId') companyId: string) {
    return this.tripsService.findAll(companyId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Post('broadcast')
  broadcast(
    @GetUser('id') userId: string,
    @GetUser('companyId') companyId: string,
    @Body('content') content: string,
  ) {
    return this.tripsService.broadcastToMyTrucks(userId, companyId, content);
  }

  // NOTE: must come before :id to avoid route conflict
  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Get('truck/:truckId')
  findByTruck(
    @Param('truckId') truckId: string,
    @GetUser('companyId') companyId: string,
  ) {
    return this.tripsService.findByTruck(truckId, companyId);
  }

  // ─── Driver-scoped (mobile app) ──────────────────────────────────────────
  @Roles('DRIVER')
  @Get('my')
  findMyTrips(@GetUser('id') driverId: string) {
    return this.tripsService.findMyTrips(driverId);
  }

  @Roles('DRIVER')
  @Get('my/active')
  findMyActiveTrip(@GetUser('id') driverId: string) {
    return this.tripsService.findMyActiveTrip(driverId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Get(':id')
  findOne(@Param('id') id: string, @GetUser('companyId') companyId: string) {
    return this.tripsService.findOne(id, companyId);
  }

  // load message history for a trip.
  // Defaults to the latest 50 messages. Pass `before` (ISO date) to page
  // backward into older history; pass `take` (1..100) to override the page
  // size.
  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Get(':id/messages')
  getMessages(
    @Param('id') id: string,
    @Query() query: GetTripMessagesDto,
    @GetUser('companyId') companyId: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
  ) {
    return this.tripsService.getMessages(
      id,
      companyId,
      { id: userId, role },
      {
        take: query.take,
        before: query.before ? new Date(query.before) : undefined,
      },
    );
  }

  // update trip info (notes + stops)
  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Patch(':id/info')
  updateInfo(
    @Param('id') id: string,
    @GetUser('companyId') companyId: string,
    @Body() dto: UpdateTripDto,
  ) {
    return this.tripsService.updateInfo(id, companyId, dto);
  }

  /** Reassign an existing trip to a different driver. */
  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Patch(':id/assign')
  assignDriver(
    @Param('id') id: string,
    @GetUser('companyId') companyId: string,
    @GetUser('id') userId: string,
    @Body() dto: AssignTripDto,
  ) {
    return this.tripsService.assignDriver(id, companyId, dto.driverId, userId);
  }

  /** Reassign an existing trip to a different manager. */
  @Roles('ADMIN', 'TEAMLEAD')
  @Patch(':id/manager')
  assignManager(
    @Param('id') id: string,
    @GetUser('companyId') companyId: string,
    @GetUser('id') userId: string,
    @Body() dto: AssignManagerDto,
  ) {
    return this.tripsService.assignManager(
      id,
      companyId,
      dto.managerId,
      userId,
    );
  }

  // ─── Chat archive (closed sessions) ──────────────────────────────────────
  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Get(':id/chat/archive')
  getChatArchive(
    @Param('id') id: string,
    @GetUser('companyId') companyId: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
  ) {
    return this.tripsService.getChatArchive(id, companyId, { id: userId, role });
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Get(':id/chat/sessions/:sessionId/messages')
  getSessionMessages(
    @Param('sessionId') sessionId: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
  ) {
    return this.tripsService.getSessionMessages(sessionId, { id: userId, role });
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
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
