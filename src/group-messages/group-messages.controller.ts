import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { GroupMessagesService } from './group-messages.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('group-messages')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('group-messages')
export class GroupMessagesController {
  constructor(private service: GroupMessagesService) {}

  @Get(':groupId')
  getMessages(@Param('groupId') groupId: string) {
    return this.service.getMessages(groupId);
  }
}
