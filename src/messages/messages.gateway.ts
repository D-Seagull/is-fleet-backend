import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from 'src/prisma/prisma.service';

import { CreateMessageDto } from './dto/create-message.dto';
import { JoinTripDto } from './dto/join-trip.dto';
import { JwtService } from '@nestjs/jwt';
import { corsOrigin } from 'src/common/cors-origin';
import { isCompanyWriteBlocked } from 'src/common/utils/company-write-guard';
import { authenticateSocket, socketUser } from 'src/common/utils/socket-auth';
import { assertTripAccess } from 'src/common/utils/access';
import { PresenceService } from 'src/push/presence.service';

@WebSocketGateway({
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
})
export class MessagesGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessagesGateway.name);

  constructor(
    @Inject(forwardRef(() => MessagesService))
    private messagesService: MessagesService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private presence: PresenceService,
  ) {}

  /** Every gateway shares this server — PushService reads presence off it. */
  afterInit(server: Server) {
    this.presence.attach(server);
  }

  // Offline users seen within this window render as "away" (amber); older →
  // grey OFFLINE.
  private static readonly AWAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

  /** Bump the user's last-seen so the away/offline tier can age out. */
  private touchLastSeen(userId: string) {
    void this.prisma.user
      .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }

  /** Company members who are offline but were seen within the away window. */
  private async awayUserIds(
    companyId: string,
    onlineIds: string[],
  ): Promise<string[]> {
    const since = new Date(Date.now() - MessagesGateway.AWAY_WINDOW_MS);
    const recent = await this.prisma.user.findMany({
      where: { companyId, lastSeenAt: { gte: since } },
      select: { id: true },
    });
    const online = new Set(onlineIds);
    return recent.map((r) => r.id).filter((id) => !online.has(id));
  }

  async handleConnection(client: Socket) {
    // Synchronous first call — caches the lookup for every gateway and for
    // handlers that fire before it resolves (see authenticateSocket).
    const me = await authenticateSocket(client, this.jwtService, this.prisma);
    if (!me) {
      // No anonymous sockets: one left connected could still join rooms and
      // listen. Clients re-handshake with a fresh token (web on refresh /
      // tab focus, mobile via the liveness watchdog).
      this.logger.warn(`${client.id} rejected: no valid token / inactive user`);
      client.disconnect(true);
      return;
    }
    try {
      const { userId, companyId, role } = me;
      // Foreground flag — clients flip it via appActive/appBackground events.
      // Defaults to true on fresh connect (clients connect when they open
      // the app); mobile flips it back to false in onBackground.
      client.data.active = true;
      // Clients say what they are in the handshake. The web / desktop counts
      // as "in use" while it pulses (visible, focused, touched recently) — see
      // isSocketActive — and holds the push back, so the phone stays quiet
      // while the manager works on the desktop and rings again once they walk
      // away. Phones never hold pushes back: the app decides on screen itself.
      client.data.mobile = client.handshake.auth?.client === 'mobile';
      client.data.web = client.handshake.auth?.client === 'web';
      // Shows the `notice` socket event in-app (PushService sends it instead
      // of a push while the web is in use). Older builds don't, and keep
      // getting pushes.
      client.data.notices = client.handshake.auth?.notices === true;
      void client.join(userId);
      // Global admins room — cross-company presence nudges for the admin
      // dashboard's live "online now" list (admins oversee every company, so
      // this room is NOT company-scoped like `company-…`).
      if (role === 'ADMIN') void client.join('admins');
      this.touchLastSeen(userId);
      // Company-level room — kept for presence broadcasts (userPresence-
      // Changed / presenceSnapshot). Unread-related signals now go to
      // role-scoped rooms below (Phase 2 fan-out).
      {
        await client.join(`company-${companyId}`);

        // Role-scoped rooms for tripUnreadChanged routing. ADMIN/TEAMLEAD
        // see all chats via the company-admin room. MANAGER and DRIVER
        // get signals through their personal userId room (emitted from
        // session.driverId / session.managerId at send-time), so they
        // stop receiving updates the moment they're replaced on a trip
        // without needing to reconnect.
        if (role === 'ADMIN' || role === 'TEAMLEAD') {
          await client.join(`company-admin-${companyId}`);
        }

        // Tell this client who in their company is currently online so
        // they don't have to wait for the next presence event to render
        // the right dots.
        const sockets = await this.server
          .in(`company-${companyId}`)
          .fetchSockets();
        const onlineUserIds = Array.from(
          new Set(
            sockets
              .map((s) => (s.data as { userId?: string }).userId)
              .filter((id): id is string => typeof id === 'string'),
          ),
        );
        const awayUserIds = await this.awayUserIds(companyId, onlineUserIds);
        client.emit('presenceSnapshot', { userIds: onlineUserIds, awayUserIds });

        // If this is the user's first socket in the company room, tell
        // everyone else they came online. (Skip the broadcast on the
        // 2nd+ socket — it's redundant and would flash the dot.)
        const mySockets = sockets.filter(
          (s) =>
            (s.data as { userId?: string }).userId === userId &&
            s.id !== client.id,
        );
        if (mySockets.length === 0) {
          this.server.to(`company-${companyId}`).emit('userPresenceChanged', {
            userId,
            online: true,
          });
          // Nudge the admin dashboard to refresh its cross-company online list.
          this.server.to('admins').emit('adminPresenceChanged', {
            userId,
            online: true,
          });
        }
      }
      this.logger.log(`${client.id} → room:${userId} company:${companyId}`);
    } catch (e) {
      this.logger.warn(
        `${client.id} connection setup failed: ${(e as Error).message}`,
      );
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = (client.data as { userId?: string }).userId;
    const companyId = (client.data as { companyId?: string }).companyId;
    this.logger.log(
      `Client disconnected: ${client.id} user:${userId ?? 'n/a'}`,
    );
    if (!userId || !companyId) return;
    this.touchLastSeen(userId);

    // Socket.io removes the socket from rooms BEFORE handleDisconnect
    // fires, so a fetch now reflects the post-disconnect state.
    const remaining = await this.server
      .in(`company-${companyId}`)
      .fetchSockets();
    const mineLeft = remaining.some(
      (s) => (s.data as { userId?: string }).userId === userId,
    );
    if (!mineLeft) {
      // They just went offline, so they're within the away window → amber.
      this.server.to(`company-${companyId}`).emit('userPresenceChanged', {
        userId,
        online: false,
        away: true,
      });
      this.server.to('admins').emit('adminPresenceChanged', {
        userId,
        online: false,
      });
    }
  }

  /**
   * All userIds with at least one live socket, across every company. Backs the
   * admin dashboard's cross-company "online now" list — "online" here means an
   * open socket, the truest signal (unlike the stored `User.status` preference).
   */
  async getOnlineUserIds(): Promise<string[]> {
    const sockets = await this.server.fetchSockets();
    return Array.from(
      new Set(
        sockets
          .map((s) => (s.data as { userId?: string }).userId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    );
  }

  /**
   * Client opt-in for a fresh presence snapshot. We already send one
   * automatically on connect, but the client's listener may not have
   * been registered yet — usePresenceSync re-asks once it is ready so
   * the very-first frame after login already has the dot in the right
   * colour.
   */
  @SubscribeMessage('requestPresence')
  async handleRequestPresence(@ConnectedSocket() client: Socket) {
    const companyId = (await socketUser(client))?.companyId;
    if (!companyId) return;
    const sockets = await this.server
      .in(`company-${companyId}`)
      .fetchSockets();
    const onlineUserIds = Array.from(
      new Set(
        sockets
          .map((s) => (s.data as { userId?: string }).userId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    );
    const awayUserIds = await this.awayUserIds(companyId, onlineUserIds);
    client.emit('presenceSnapshot', { userIds: onlineUserIds, awayUserIds });
  }

  /**
   * Trip rooms carry every live trip-chat event, so joining one needs the same
   * right as reading the chat over HTTP: a trip of the caller's company (a
   * driver: one they drive / drove). Only real trip ids — the room namespace
   * is shared with `userId`, `company-…` and `admins` rooms.
   */
  @SubscribeMessage('joinTrip')
  async handleJoinTrip(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinTripDto,
  ) {
    const me = await socketUser(client);
    if (!me) return { error: 'unauthenticated' };
    try {
      const trip = await assertTripAccess(this.prisma, body?.tripId, {
        id: me.userId,
        role: me.role,
        companyId: me.companyId,
      });
      await client.join(trip.id);
      this.logger.log(`${client.id} joined room:${trip.id}`);
      return { ok: true };
    } catch {
      this.logger.warn(`${client.id} joinTrip refused`);
      return { error: 'errors.tripNotFound' };
    }
  }

  @SubscribeMessage('sendMessage')
  async handleTripMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: CreateMessageDto,
  ) {
    // Always use the authenticated userId from the JWT — never trust client-sent senderId
    const senderId = (await socketUser(client))?.userId;
    this.logger.debug(
      `sendMessage from ${client.id} senderId=${senderId} tripId=${dto.tripId}`,
    );
    if (!senderId) {
      this.logger.warn(
        `sendMessage REJECTED — no senderId on socket ${client.id}`,
      );
      return;
    }

    if (await isCompanyWriteBlocked(this.prisma, senderId)) {
      return { error: 'errors.companyDeactivated' };
    }

    try {
      const message = await this.messagesService.create(senderId, dto);
      // Echo the client-side tempId so the sender's UI can locate its
      // optimistic placeholder bubble and replace it with the real row.
      const payload = { ...message, tempId: dto.tempId ?? null };
      // Emit to the trip room (driver + manager in that trip) — these are
      // the only sockets that actually need the full message body to
      // render it in the chat.
      this.server.to(dto.tripId).emit('newMessage', payload);

      // Phase 2 fan-out: send the lightweight tripUnreadChanged signal
      // ONLY to the stakeholders who actually need their unread badges
      // invalidated. Drivers / managers of other trips no longer see
      // signals about chats they're not involved with.
      const companyId = (message as { trip?: { companyId?: string } }).trip
        ?.companyId;
      const driverId = (message as { session?: { driverId: string | null } })
        .session?.driverId;
      const managerId = (message as { session?: { managerId: string | null } })
        .session?.managerId;
      // Carry just enough for the client to raise a desktop notification
      // (sender + text + truck to navigate to) without a follow-up fetch.
      const sender = (
        message as {
          sender?: { firstName: string; lastName: string | null };
        }
      ).sender;
      const senderName = sender
        ? `${sender.firstName} ${sender.lastName ?? ''}`.trim()
        : '';
      const truckId = (message as { trip?: { truckId: string | null } }).trip
        ?.truckId;
      const signal = {
        tripId: dto.tripId,
        truckId: truckId ?? null,
        senderId,
        senderName,
        content: message.content ?? '',
      };

      // Company ADMIN / TEAMLEAD + the session's driver and manager (their
      // personal rooms — what refreshes the sidebar badge on other pages).
      this.emitTripUnread(signal, { companyId, driverId, managerId });
      this.logger.debug(
        `newMessage emitted to room ${dto.tripId} id=${message.id}`,
      );
      return payload;
    } catch (e) {
      this.logger.error('sendMessage FAILED', e as Error);
      throw e;
    }
  }

  @SubscribeMessage('markTripRead')
  async handleMarkTripRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinTripDto,
  ) {
    const userId = (await socketUser(client))?.userId;
    if (!userId || typeof body?.tripId !== 'string') return;
    const result = await this.messagesService.markTripRead(
      body.tripId,
      userId,
    );
    if (result.messageIds.length === 0 && result.documentIds.length === 0) return;
    // Notify everyone in the trip room (incl. the original sender) so their
    // bubbles can flip to ✓✓.
    this.server.to(body.tripId).emit('tripMessagesRead', {
      tripId: body.tripId,
      readerId: userId,
      messageIds: result.messageIds,
      documentIds: result.documentIds,
    });
    // Refresh the reader's own unread badge / bell — they just cleared this
    // trip, so their notification counter must drop (they may not be sitting
    // in the trip room from the bell's perspective).
    this.server
      .to(userId)
      .emit('tripUnreadChanged', { tripId: body.tripId });
  }

  /**
   * Ephemeral "is typing" signal. Privacy: only the trip's current driver or
   * manager may broadcast — old participants who still hold the room can't
   * leak presence into the new pair's chat.
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinTripDto,
  ) {
    const userId = (await socketUser(client))?.userId;
    if (!userId || typeof body?.tripId !== 'string') return;
    const trip = await this.prisma.trip.findFirst({
      where: { id: body.tripId, deletedAt: null },
      select: { driverId: true, managerId: true },
    });
    if (!trip) return;
    if (userId !== trip.driverId && userId !== trip.managerId) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, avatar: true },
    });
    // Broadcast to everyone else in the trip room (skip the sender's socket).
    client.to(body.tripId).emit('userTyping', {
      tripId: body.tripId,
      user: { id: userId, firstName: user?.firstName ?? null, lastName: user?.lastName ?? null },
    });
  }

  @SubscribeMessage('stopTyping')
  async handleStopTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinTripDto,
  ) {
    const userId = (await socketUser(client))?.userId;
    // Only from inside the room (joinTrip checked access) — no broadcasting
    // into a trip the caller can't see.
    if (!userId || typeof body?.tripId !== 'string') return;
    if (!client.rooms.has(body.tripId)) return;
    client.to(body.tripId).emit('userStopTyping', {
      tripId: body.tripId,
      userId,
    });
  }

  // Called from DocumentsService after an HTTP upload completes — pushes the
  // new doc to everyone in the trip room so the chat timeline updates without
  // a refetch.
  emitNewDocument(tripId: string, doc: unknown) {
    this.server.to(tripId).emit('newDocument', doc);
  }

  // Lightweight `tripUnreadChanged` fan-out for a new trip message or
  // document (attachments count toward the unread bell like text) to the
  // stakeholders who aren't sitting in the trip room. Skips the sender /
  // uploader — no unread for self.
  emitTripUnread(signal: {
    tripId: string;
    truckId: string | null;
    senderId: string;
    senderName: string;
    content: string;
  }, opts: {
    companyId?: string | null;
    driverId?: string | null;
    managerId?: string | null;
  }) {
    const { companyId, driverId, managerId } = opts;
    // ONE emit to all rooms: socket.io then delivers once per socket. Separate
    // emits reached a teamlead/admin who is also the trip's manager twice
    // (company-admin room + personal room) → two desktop notifications.
    const rooms: string[] = [];
    if (companyId) rooms.push(`company-admin-${companyId}`);
    if (driverId && driverId !== signal.senderId) rooms.push(driverId);
    if (managerId && managerId !== signal.senderId) rooms.push(managerId);
    if (rooms.length) this.server.to(rooms).emit('tripUnreadChanged', signal);
  }

  emitDocumentDeleted(tripId: string, documentId: string) {
    this.server.to(tripId).emit('documentDeleted', { tripId, documentId });
  }

  emitMessageDeleted(tripId: string, messageId: string) {
    this.server.to(tripId).emit('messageDeleted', { tripId, messageId });
  }

  emitMessageEdited(tripId: string, message: unknown) {
    this.server.to(tripId).emit('messageEdited', { tripId, message });
  }

  // `{ pulse: true }` — sent every 15 s by a web window in use (see
  // isSocketActive) and by phones on screen (not used for pushes any more);
  // socket existence alone can't mean "in use" — clients flip `data.active`.
  @SubscribeMessage('appActive')
  handleAppActive(
    @ConnectedSocket() client: Socket,
    @MessageBody() body?: { pulse?: boolean },
  ) {
    client.data.active = true;
    if (body?.pulse === true) client.data.pulseAt = Date.now();
  }

  @SubscribeMessage('appBackground')
  handleAppBackground(@ConnectedSocket() client: Socket) {
    client.data.active = false;
  }
}
