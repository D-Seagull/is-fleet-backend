import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { DirectMessagesService } from './direct-messages.service';
import { GroupMessagesService } from 'src/group-messages/group-messages.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class DirectMessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private service: DirectMessagesService,
    private groupService: GroupMessagesService,
    private jwt: JwtService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token as string;
      console.log('Received token:', token ? 'exists' : 'missing');
      const payload = this.jwt.verify(token);
      console.log('Payload:', payload);
      client.data.userId = payload.sub;

      // Приєднуємо до особистої кімнати
      await client.join(`user:${payload.sub}`);
      console.log(`✅ User ${payload.sub} connected`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`❌ User ${client.data.userId} disconnected`);
  }

  @SubscribeMessage('send_direct_message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: string; content: string },
  ) {
    const senderId = client.data.userId as string;
    const message = await this.service.createMessage(
      senderId,
      data.receiverId,
      data.content,
    );

    // Відправляємо обом учасникам
    this.server.to(`user:${senderId}`).emit('new_direct_message', message);
    this.server
      .to(`user:${data.receiverId}`)
      .emit('new_direct_message', message);

    return message;
  }
  @SubscribeMessage('typing_start')
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: string },
  ) {
    this.server
      .to(`user:${data.receiverId}`)
      .emit('user_typing', { userId: client.data.userId });
  }

  @SubscribeMessage('typing_stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: string },
  ) {
    this.server
      .to(`user:${data.receiverId}`)
      .emit('user_stopped_typing', { userId: client.data.userId });
  }
  @SubscribeMessage('mark_as_read')
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { senderId: string },
  ) {
    console.log('mark_as_read received:', data);
    await this.service.markAsRead(client.data.userId as string, data.senderId);
    console.log('marked as read, notifying:', data.senderId);

    this.server
      .to(`user:${data.senderId}`)
      .emit('messages_read', { readBy: client.data.userId });

    console.log('messages_read emitted to:', `user:${data.senderId}`);
  }
  // ─── Group messages ───────────────────────────────────────────────────────
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
  async handleGroupMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string; content: string },
  ) {
    console.log(
      `💬 send_group_message from ${client.data.userId} to group ${data.groupId}`,
    );
    const senderId = client.data.userId as string;
    const message = await this.groupService.createMessage(
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
