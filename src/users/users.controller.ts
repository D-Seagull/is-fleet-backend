import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Param,
  Patch,
  UseInterceptors,
  UploadedFile,
  Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { CreateManagerDto } from './dto/create-manager.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { RegisterPushTokenDto } from './dto/push-token.dto';
import { SetTimezoneDto } from './dto/timezone.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  // Only a TEAMLEAD can create a manager — the new manager is auto-attached
  // to the creator as their team lead. ADMIN cannot create managers here
  // (they would produce a dangling teamleadId). To move a manager between
  // teams later, use PATCH /users/:id { teamleadId }.
  @Roles('TEAMLEAD')
  @Post('manager')
  createManager(
    @GetUser('companyId') companyId: string,
    @GetUser('id') creatorId: string,
    @Body() dto: CreateManagerDto,
  ) {
    return this.usersService.createManager(companyId, creatorId, dto);
  }

  @Roles('ADMIN', 'MANAGER', 'TEAMLEAD')
  @Post('driver')
  createDriver(
    @GetUser('companyId') companyId: string,
    @GetUser('id') creatorId: string,
    @Body() dto: CreateDriverDto,
  ) {
    return this.usersService.createDriver(companyId, creatorId, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Get()
  getUsers(@GetUser('companyId') companyId: string) {
    return this.usersService.getCompanyUsers(companyId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Get(':id')
  getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }

  // Self-update: every authenticated role can edit their own profile here.
  // Declared before the `:id` patch so Nest doesn't treat "me" as a UUID.
  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Patch('me')
  updateMe(
    @GetUser('id') userId: string,
    @Body() dto: UpdateMeDto,
  ) {
    return this.usersService.updateMe(userId, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Patch(':id')
  updateDriver(
    @Param('id') id: string,
    @GetUser('companyId') companyId: string,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.usersService.updateDriver(id, companyId, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Patch(':id/activate')
  activate(@Param('id') id: string, @GetUser('companyId') companyId: string) {
    return this.usersService.activate(id, companyId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Patch(':id/deactivate')
  deactivate(
    @Param('id') id: string,
    @GetUser('companyId') companyId: string,
    @GetUser('role') role: string,
  ) {
    return this.usersService.deactivate(id, companyId, role);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Post(':id/ratings')
  upsertRating(
    @Param('id') driverId: string,
    @GetUser('id') ratedById: string,
    @Body() body: { score: number; comment?: string; anonymous?: boolean },
  ) {
    return this.usersService.upsertRating(
      driverId,
      ratedById,
      body.score,
      body.comment,
      body.anonymous,
    );
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER')
  @Get(':id/ratings')
  getDriverRatings(@Param('id') driverId: string) {
    return this.usersService.getDriverRatings(driverId);
  }

  // ── Manager rating: only drivers in the company can rate managers ─────
  @Roles('DRIVER')
  @Post(':id/manager-ratings')
  upsertManagerRating(
    @Param('id') managerId: string,
    @GetUser('id') ratedById: string,
    @GetUser('companyId') companyId: string,
    @Body() body: { score: number; comment?: string; anonymous?: boolean },
  ) {
    return this.usersService.upsertManagerRating(
      managerId,
      ratedById,
      companyId,
      body.score,
      body.comment,
      body.anonymous,
    );
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Get(':id/manager-ratings')
  getManagerRatings(@Param('id') managerId: string) {
    return this.usersService.getManagerRatings(managerId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Post('avatar')
  @UseInterceptors(FileInterceptor('file'))
  uploadAvatar(
    @GetUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.uploadAvatar(userId, file);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Delete('avatar')
  deleteAvatar(@GetUser('id') userId: string) {
    return this.usersService.deleteAvatar(userId);
  }

  // ── Push tokens (mobile-driven) ───────────────────────────────────────
  /** Register / refresh an Expo push token for the current device. */
  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Post('me/push-token')
  registerPushToken(
    @GetUser('id') userId: string,
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.usersService.registerPushToken(userId, dto.token, dto.platform);
  }

  /** Unregister this device (call from logout flow). */
  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Delete('me/push-token/:token')
  unregisterPushToken(
    @GetUser('id') userId: string,
    @Param('token') token: string,
  ) {
    return this.usersService.deletePushToken(userId, token);
  }

  /** Update the current user's IANA timezone. Called by clients on auth so
   *  alarms scheduled by others fire on the user's wall-clock time. */
  @Roles('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER')
  @Patch('me/timezone')
  setTimezone(
    @GetUser('id') userId: string,
    @Body() dto: SetTimezoneDto,
  ) {
    return this.usersService.setTimezone(userId, dto.timezone);
  }
}
