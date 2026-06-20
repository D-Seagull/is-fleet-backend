import {
  Body,
  Controller,
  Delete,
  forwardRef,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GroupMessagesService } from './group-messages.service';
import { GetChatMessagesDto } from '../common/dto/get-chat-messages.dto';
import { DirectMessagesGateway } from '../direct-messages/direct-messages.gateway';
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
    @Inject(forwardRef(() => DirectMessagesGateway))
    private dmGateway: DirectMessagesGateway,
    private reactions: ReactionsService,
    private reactionsGateway: ReactionsGateway,
    private prisma: PrismaService,
  ) {}

  @Get('unread')
  getUnreadSummary(@GetUser('id') userId: string) {
    return this.service.getUnreadSummary(userId);
  }

  // Defaults to the latest 50 messages. Pass `before` (ISO date) to page
  // backward into older history; pass `take` (1..100) to override page size.
  @Get(':groupId')
  getMessages(
    @Param('groupId') groupId: string,
    @Query() query: GetChatMessagesDto,
  ) {
    return this.service.getMessages(groupId, {
      take: query.take,
      before: query.before ? new Date(query.before) : undefined,
    });
  }

  @Post(':groupId/read')
  markAsRead(
    @Param('groupId') groupId: string,
    @GetUser('id') userId: string,
  ) {
    return this.service.markAsRead(userId, groupId);
  }

  @Delete('messages/:messageId')
  async delete(
    @Param('messageId') messageId: string,
    @GetUser('id') userId: string,
  ) {
    const msg = await this.service.softDelete(messageId, userId);
    this.dmGateway.emitGroupMessageDeleted(msg.groupId, messageId);
    return { id: messageId };
  }

  @Patch('messages/:messageId')
  async edit(
    @Param('messageId') messageId: string,
    @Body('content') content: string,
    @GetUser('id') userId: string,
  ) {
    const msg = await this.service.editMessage(messageId, userId, content);
    this.dmGateway.emitGroupMessageEdited(msg.groupId, msg);
    return msg;
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
