import { Controller, Get, UseGuards } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

/**
 * Driver-facing groups. Separate from GroupsController (which is locked to
 * ADMIN/TEAMLEAD/MANAGER) — here any authenticated user can read their own
 * company groups. For now that's just the one default all-drivers group.
 */
@ApiTags('driver-groups')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('driver-groups')
export class DriverGroupsController {
  constructor(private groups: GroupsService) {}

  @Get()
  findMine(
    @GetUser('companyId') companyId: string,
    @GetUser('id') userId: string,
  ) {
    return this.groups.findDriverGroups(companyId, userId);
  }
}
