import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesGateway } from './messages.gateway';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [JwtModule],
  providers: [MessagesService, MessagesGateway],
  exports: [MessagesGateway, MessagesService],
})
export class MessagesModule {}
