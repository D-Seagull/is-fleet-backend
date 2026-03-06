import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@UseGuards(JwtGuard, RolesGuard)
@Controller('groups')
export class GroupsController {
  constructor(private groupsService: GroupsService) {}

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Post()
  create(
    @GetUser('companyId') companyId: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.groupsService.create(companyId, userId, role, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Get()
  findAll(
    @GetUser('companyId') companyId: string,
    @GetUser('role') role: string,
    @GetUser('id') userId: string,
  ) {
    return this.groupsService.findAll(companyId, role, userId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Get('trucks')
  findAllTrucks(@GetUser('companyId') companyId: string) {
    return this.groupsService.findAllTrucks(companyId);
  }

  @Roles('ADMIN', 'TEAMLEAD')
  @Get('dispatchers')
  findAllDispatchers(@GetUser('companyId') companyId: string) {
    return this.groupsService.findAllDispatchers(companyId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.update(id, userId, role, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
  ) {
    return this.groupsService.remove(id, userId, role);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Post(':id/trucks/:truckId')
  addTruck(
    @Param('id') groupId: string,
    @Param('truckId') truckId: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
  ) {
    return this.groupsService.addTruck(groupId, truckId, userId, role);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Delete(':id/trucks/:truckId')
  removeTruck(
    @Param('id') groupId: string,
    @Param('truckId') truckId: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
  ) {
    return this.groupsService.removeTruck(groupId, truckId, userId, role);
  }

  @Roles('ADMIN', 'TEAMLEAD')
  @Post(':id/dispatchers/:dispatcherId')
  addDispatcher(
    @Param('id') groupId: string,
    @Param('dispatcherId') dispatcherId: string,
  ) {
    return this.groupsService.addDispatcher(groupId, dispatcherId);
  }

  @Roles('ADMIN', 'TEAMLEAD')
  @Delete(':id/dispatchers/:dispatcherId')
  removeDispatcher(
    @Param('id') groupId: string,
    @Param('dispatcherId') dispatcherId: string,
  ) {
    return this.groupsService.removeDispatcher(groupId, dispatcherId);
  }
}
