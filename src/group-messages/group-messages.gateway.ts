import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GroupMessagesService } from './group-messages.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class GroupMessagesGateway {
  @WebSocketServer()
  server: Server;

  constructor(private service: GroupMessagesService) {}

  @SubscribeMessage('join_group')
  async handleJoinGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    await client.join(`group:${data.groupId}`);
  }

  @SubscribeMessage('leave_group')
  async handleLeaveGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    await client.leave(`group:${data.groupId}`);
  }

  @SubscribeMessage('send_group_message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string; content: string },
  ) {
    const senderId = client.data.userId as string;
    const message = await this.service.createMessage(
      data.groupId,
      senderId,
      data.content,
    );

    this.server.to(`group:${data.groupId}`).emit('new_group_message', message);

    return message;
  }
  @SubscribeMessage('group_typing')
  handleGroupTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string; name: string },
  ) {
    client.to(`group:${data.groupId}`).emit('group_typing', {
      userId: client.data.userId,
      name: data.name,
    });
  }

  @SubscribeMessage('group_stopped_typing')
  handleGroupStoppedTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    client.to(`group:${data.groupId}`).emit('group_stopped_typing', {
      userId: client.data.userId,
    });
  }
}
