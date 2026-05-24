import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { GroupMessagesService } from './group-messages.service';
import { ReactionsService } from '../reactions/reactions.service';
import { ReactionsGateway } from '../reactions/reactions.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('group-messages')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('group-messages')
export class GroupMessagesController {
  constructor(
    private service: GroupMessagesService,
    private reactions: ReactionsService,
    private reactionsGateway: ReactionsGateway,
    private prisma: PrismaService,
  ) {}

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

  @Post('messages/:messageId/react')
  async react(
    @Param('messageId') messageId: string,
    @Body('emoji') emoji: string,
    @GetUser('id') userId: string,
  ) {
    const reactions = await this.reactions.toggle(
      'GROUP',
      messageId,
      userId,
      emoji,
    );
    const message = await this.prisma.groupMessage.findUnique({
      where: { id: messageId },
      select: { groupId: true },
    });
    if (message) {
      this.reactionsGateway.emit('GROUP', messageId, reactions, [
        `group:${message.groupId}`,
      ]);
    }
    return reactions;
  }
}
