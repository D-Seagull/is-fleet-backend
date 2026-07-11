import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('groups')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('groups')
export class GroupsController {
  constructor(private groupsService: GroupsService) {}

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Post()
  create(
    @GetUser('companyId') companyId: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.groupsService.create(companyId, userId, role, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Get()
  findAll(
    @GetUser('companyId') companyId: string,
    @GetUser('role') role: string,
    @GetUser('id') userId: string,
  ) {
    return this.groupsService.findAll(companyId, role, userId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Get('trucks')
  findAllTrucks(@GetUser('companyId') companyId: string) {
    return this.groupsService.findAllTrucksGroups(companyId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Get('managers')
  findAllManagers(
    @GetUser('companyId') companyId: string,
    @GetUser('role') role: string,
    @GetUser('id') userId: string,
  ) {
    return this.groupsService.findAllManagersGroups(companyId, role, userId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.update(id, userId, role, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Post(':id/hide')
  hideForUser(
    @Param('id') id: string,
    @GetUser('id') userId: string,
  ) {
    return this.groupsService.hideForUser(id, userId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
  ) {
    return this.groupsService.remove(id, userId, role);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Post(':id/trucks/:truckId')
  addTruck(
    @Param('id') groupId: string,
    @Param('truckId') truckId: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
  ) {
    return this.groupsService.addTruck(groupId, truckId, userId, role);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Delete(':id/trucks/:truckId')
  removeTruck(
    @Param('id') groupId: string,
    @Param('truckId') truckId: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
  ) {
    return this.groupsService.removeTruck(groupId, truckId, userId, role);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Post(':id/managers/:managerId')
  addManager(
    @Param('id') groupId: string,
    @Param('managerId') managerId: string,
  ) {
    return this.groupsService.addManager(groupId, managerId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Delete(':id/managers/:managerId')
  removeManager(
    @Param('id') groupId: string,
    @Param('managerId') managerId: string,
  ) {
    return this.groupsService.removeManager(groupId, managerId);
  }

  // Group avatar — service enforces membership (creator + members + ADMIN).
  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Post(':id/avatar')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadAvatar(
    @Param('id') groupId: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.groupsService.uploadAvatar(groupId, userId, role, file);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Delete(':id/avatar')
  deleteAvatar(
    @Param('id') groupId: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
  ) {
    return this.groupsService.deleteAvatar(groupId, userId, role);
  }
}
