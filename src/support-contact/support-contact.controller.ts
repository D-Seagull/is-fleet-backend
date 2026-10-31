import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { JwtGuard } from 'src/auth/guards/jwt.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { GetChatMessagesDto } from 'src/common/dto/get-chat-messages.dto';
import { SupportContactService } from './support-contact.service';

class SupportReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content: string;
}

/**
 * Admin support inbox: the "IS Fleet contact" chats with every user, and
 * platform admins read and answer them here, as the contact.
 */
@ApiTags('support')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Roles('ADMIN')
@Controller('support')
export class SupportContactController {
  constructor(private contact: SupportContactService) {}

  @Get('conversations')
  conversations() {
    return this.contact.conversations();
  }

  @Get(':userId')
  messages(
    @Param('userId') userId: string,
    @Query() query: GetChatMessagesDto,
  ) {
    return this.contact.messages(userId, {
      take: query.take,
      before: query.before ? new Date(query.before) : undefined,
    });
  }

  @Post(':userId/read')
  markRead(@Param('userId') userId: string) {
    return this.contact.markRead(userId);
  }

  @Post(':userId')
  reply(@Param('userId') userId: string, @Body() dto: SupportReplyDto) {
    return this.contact.reply(userId, dto.content);
  }
}
