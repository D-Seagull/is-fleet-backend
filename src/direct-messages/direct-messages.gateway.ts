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
import { PrismaService } from 'src/prisma/prisma.service';

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
    private prisma: PrismaService,
  ) {}

  handleConnection(client: Socket) {
    try {
      // Accept token from web (auth.token) OR mobile (query.userId)
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.query?.userId as string | undefined);
      if (!token) throw new Error('No token');
      // Explicit secret — mirrors MessagesGateway. Without it `jwt.verify`
      // can silently fail when the JwtModule default differs.
      const payload = this.jwt.verify(token, {
        secret: process.env.JWT_SECRET,
      });
      // userId may already be set by MessagesGateway.handleConnection — only overwrite if missing
      if (!client.data.userId) client.data.userId = payload.sub;
      // Sync join — `void` so we don't block event delivery while waiting.
      void client.join(`user:${payload.sub}`);
      console.log(`[dm-gateway] user ${payload.sub} joined user:${payload.sub}`);
    } catch (e) {
      // Soft fail: log but do NOT disconnect — the socket may still be valid
      // for trip-chat (MessagesGateway). Disconnecting here kills trip chat too.
      console.log(`[dm-gateway] auth failed for ${client.id}: ${(e as Error).message}`);
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
    // Also notify the reader so their own DM-unread counter can refresh
    // immediately (without waiting for the 20s polling fallback).
    this.server
      .to(`user:${client.data.userId}`)
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
    // Also broadcast a lightweight notification to every group member's
    // personal room so their unread counter updates even when they're not
    // currently viewing the group (e.g. on /trucks, /managers, etc).
    const group = await this.prisma.group.findUnique({
      where: { id: data.groupId },
      select: {
        createdBy: true,
        managers: { select: { managerId: true } },
      },
    });
    if (group) {
      const memberIds = new Set<string>([
        group.createdBy,
        ...group.managers.map((m) => m.managerId),
      ]);
      for (const memberId of memberIds) {
        this.server
          .to(`user:${memberId}`)
          .emit('group_unread_update', { groupId: data.groupId });
      }
    }
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

  @SubscribeMessage('mark_group_read')
  async handleMarkGroupRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    const userId = client.data.userId as string;
    await this.groupService.markAsRead(userId, data.groupId);
    // Emit to the group room so other members may update read indicators,
    // and to the reader so their own unread-summary refreshes.
    this.server
      .to(`group:${data.groupId}`)
      .emit('group_messages_read', { groupId: data.groupId, readBy: userId });
    this.server
      .to(`user:${userId}`)
      .emit('group_messages_read', { groupId: data.groupId, readBy: userId });
  }

  // ─── Conversation documents (called from services) ────────────────────────

  emitNewDirectDocument(
    uploaderId: string,
    otherUserId: string,
    doc: unknown,
  ) {
    this.server.to(`user:${uploaderId}`).emit('new_direct_document', doc);
    this.server.to(`user:${otherUserId}`).emit('new_direct_document', doc);
  }

  emitDirectDocumentDeleted(
    uploaderId: string,
    otherUserId: string,
    docId: string,
  ) {
    this.server
      .to(`user:${uploaderId}`)
      .emit('direct_document_deleted', { id: docId });
    this.server
      .to(`user:${otherUserId}`)
      .emit('direct_document_deleted', { id: docId });
  }

  emitNewGroupDocument(groupId: string, doc: unknown) {
    this.server.to(`group:${groupId}`).emit('new_group_document', doc);
  }

  emitGroupDocumentDeleted(groupId: string, docId: string) {
    this.server
      .to(`group:${groupId}`)
      .emit('group_document_deleted', { id: docId });
  }
}
