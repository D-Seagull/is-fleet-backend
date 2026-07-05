import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SessionEndReason } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { fullName } from 'src/common/utils/full-name';

/**
 * Manages chat session lifecycle per trip.
 * A session represents one (driver, manager) pair on a trip; when either
 * participant changes, the active session is closed and a new one is opened.
 * Messages are scoped to a session, giving each (driver, manager) pair a
 * private chat history that is invisible to subsequent participants.
 */
@Injectable()
export class TripChatSessionsService {
  constructor(private prisma: PrismaService) {}

  async getActiveSession(tripId: string, tx: Prisma.TransactionClient = this.prisma) {
    return tx.tripChatSession.findFirst({
      where: { tripId, endedAt: null },
    });
  }

  /**
   * Returns IDs of sessions visible in the LIVE chat view for this trip.
   * Strict: only current participants can open the live chat — replaced
   * managers/drivers and team leads lose access here. To browse a chat
   * they no longer participate in, they use the archive endpoints
   * (findArchived / findMessagesBySession), which have looser rules.
   *
   *  - ADMIN → every session in the trip.
   *  - Current driver of the trip → sessions where they were the driver.
   *  - Current manager of the trip → sessions where they were the manager.
   *  - Anyone else (including TEAMLEAD) → nothing.
   */
  async getVisibleSessionIds(
    tripId: string,
    requester: { id: string; role: string },
  ): Promise<string[]> {
    if (requester.role === 'ADMIN') {
      const sessions = await this.prisma.tripChatSession.findMany({
        where: { tripId },
        select: { id: true },
      });
      return sessions.map((s) => s.id);
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { driverId: true, managerId: true },
    });
    if (!trip) return [];

    const orClauses: Prisma.TripChatSessionWhereInput[] = [];
    if (trip.driverId === requester.id) {
      orClauses.push({ driverId: requester.id });
    }
    if (trip.managerId === requester.id) {
      orClauses.push({ managerId: requester.id });
    }
    if (orClauses.length === 0) return [];

    const sessions = await this.prisma.tripChatSession.findMany({
      where: { tripId, OR: orClauses },
      select: { id: true },
    });
    return sessions.map((s) => s.id);
  }

  private async getTeamManagerIds(teamleadId: string): Promise<string[]> {
    const members = await this.prisma.user.findMany({
      where: { teamleadId, role: 'MANAGER' },
      select: { id: true },
    });
    return members.map((m) => m.id);
  }

  async getActiveSessionOrThrow(tripId: string, tx: Prisma.TransactionClient = this.prisma) {
    const session = await this.getActiveSession(tripId, tx);
    if (!session) {
      throw new NotFoundException('No active chat session for this trip');
    }
    return session;
  }

  /** Open the very first session for a freshly-created trip. */
  async openInitial(
    tripId: string,
    driverId: string,
    managerId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.tripChatSession.create({
      data: { tripId, driverId, managerId },
    });
  }

  /**
   * Close the current active session and open a new one with new participants.
   * Runs in a transaction so we never end up with two active sessions.
   * Also writes a system message into the new session announcing the change
   * (visible inline in chat, Telegram-style).
   */
  async closeAndOpenNew(
    tripId: string,
    reason: SessionEndReason,
    newDriverId: string,
    newManagerId: string,
    triggeredById: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const active = await this.getActiveSession(tripId, tx);

      // Single canonical wording: one system message in the NEW session only.
      // The old session simply ends — its last visible chat line is whatever
      // the previous participants exchanged. This avoids any duplication for
      // a continuing participant (e.g. driver kept across a manager swap).
      const [driver, manager, trip] = await Promise.all([
        tx.user.findUnique({
          where: { id: newDriverId },
          select: { firstName: true, lastName: true, avatar: true },
        }),
        tx.user.findUnique({
          where: { id: newManagerId },
          select: { firstName: true, lastName: true, avatar: true },
        }),
        tx.trip.findUnique({
          where: { id: tripId },
          select: { truck: { select: { plate: true } } },
        }),
      ]);
      const plate = trip?.truck.plate ?? '';

      let content = '';
      if (reason === 'DRIVER_CHANGED') {
        content = `До вантажівки ${plate} призначений водій ${fullName(driver) || 'без імені'}`;
      } else if (reason === 'MANAGER_CHANGED') {
        content = `До вантажівки ${plate} призначений менеджер ${fullName(manager) || 'без імені'}`;
      }

      // 1. Close the old session.
      if (active) {
        await tx.tripChatSession.update({
          where: { id: active.id },
          data: { endedAt: new Date(), endReason: reason },
        });
      }

      // 2. Open the new session.
      const newSession = await tx.tripChatSession.create({
        data: {
          tripId,
          driverId: newDriverId,
          managerId: newManagerId,
        },
      });

      // 3. Write the single system message into the NEW session — unread so
      //    the new participant sees a notification badge. Returned so the
      //    caller can broadcast `newMessage` over sockets — clients add it
      //    to the chat instantly without waiting for a refetch poll.
      let systemMessage: Awaited<
        ReturnType<typeof tx.message.create>
      > | null = null;
      if (content) {
        systemMessage = await tx.message.create({
          data: {
            tripId,
            sessionId: newSession.id,
            senderId: triggeredById,
            content,
            isSystem: true,
            isRead: false,
          },
          include: {
            sender: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
            session: { select: { driverId: true, managerId: true } },
          },
        });
      }

      return { session: newSession, systemMessage };
    });
  }

  /** Close the active session without opening a replacement (e.g. trip completed). */
  async closeActive(
    tripId: string,
    reason: SessionEndReason,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const active = await this.getActiveSession(tripId, tx);
    if (!active) return null;
    return tx.tripChatSession.update({
      where: { id: active.id },
      data: { endedAt: new Date(), endReason: reason },
    });
  }

  /**
   * List archived (closed) sessions visible to the requester. Same rule
   * as getVisibleSessionIds — see that method's docstring — plus the
   * archived-only filter.
   */
  async findArchived(
    tripId: string,
    requester: { id: string; role: string },
  ) {
    let extraWhere: Prisma.TripChatSessionWhereInput = {};

    if (requester.role !== 'ADMIN') {
      const orClauses: Prisma.TripChatSessionWhereInput[] = [
        { driverId: requester.id },
        { managerId: requester.id },
      ];
      if (requester.role === 'TEAMLEAD') {
        const teamManagerIds = await this.getTeamManagerIds(requester.id);
        if (teamManagerIds.length > 0) {
          orClauses.push({ managerId: { in: teamManagerIds } });
        }
      }
      extraWhere = { OR: orClauses };
    }

    return this.prisma.tripChatSession.findMany({
      where: {
        tripId,
        endedAt: { not: null },
        ...extraWhere,
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
        manager: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Read messages of a specific session, with access control. Same rule
   * as getVisibleSessionIds — see that method's docstring.
   */
  async findMessagesBySession(
    sessionId: string,
    requester: { id: string; role: string },
  ) {
    const session = await this.prisma.tripChatSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Session not found');

    const isParticipant =
      session.driverId === requester.id ||
      session.managerId === requester.id;

    let isTeamManaged = false;
    if (
      !isParticipant &&
      requester.role === 'TEAMLEAD' &&
      session.managerId
    ) {
      const sessionManager = await this.prisma.user.findUnique({
        where: { id: session.managerId },
        select: { teamleadId: true },
      });
      isTeamManaged = sessionManager?.teamleadId === requester.id;
    }

    if (
      requester.role !== 'ADMIN' &&
      !isParticipant &&
      !isTeamManaged
    ) {
      throw new ForbiddenException('No access to this chat session');
    }

    return this.prisma.message.findMany({
      where: { sessionId },
      include: { sender: { select: { id: true, firstName: true, lastName: true, avatar: true, status: true, statusUntil: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
