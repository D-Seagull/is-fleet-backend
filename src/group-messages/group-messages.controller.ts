import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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

  @Get('unread')
  getUnreadSummary(@GetUser('id') userId: string) {
    return this.service.getUnreadSummary(userId);
  }

  @Get(':groupId')
  getMessages(@Param('groupId') groupId: string) {
    return this.service.getMessages(groupId);
  }

  @Post(':groupId/read')
  markAsRead(
    @Param('groupId') groupId: string,
    @GetUser('id') userId: string,
  ) {
    return this.service.markAsRead(userId, groupId);
  }
}
