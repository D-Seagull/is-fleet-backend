import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SessionEndReason } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Manages chat session lifecycle per trip.
 * A session represents one (driver, dispatcher) pair on a trip; when either
 * participant changes, the active session is closed and a new one is opened.
 * Messages are scoped to a session, giving each (driver, dispatcher) pair a
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
    dispatcherId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.tripChatSession.create({
      data: { tripId, driverId, dispatcherId },
    });
  }

  /**
   * Close the current active session and open a new one with new participants.
   * Runs in a transaction so we never end up with two active sessions.
   */
  async closeAndOpenNew(
    tripId: string,
    reason: SessionEndReason,
    newDriverId: string,
    newDispatcherId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const active = await this.getActiveSession(tripId, tx);
      if (active) {
        await tx.tripChatSession.update({
          where: { id: active.id },
          data: { endedAt: new Date(), endReason: reason },
        });
      }
      return tx.tripChatSession.create({
        data: {
          tripId,
          driverId: newDriverId,
          dispatcherId: newDispatcherId,
        },
      });
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

  /** List archived (closed) sessions visible to the requester. */
  async findArchived(
    tripId: string,
    requester: { id: string; role: string },
  ) {
    const isManager = requester.role === 'ADMIN' || requester.role === 'TEAMLEAD';

    return this.prisma.tripChatSession.findMany({
      where: {
        tripId,
        endedAt: { not: null },
        ...(isManager
          ? {}
          : {
              OR: [
                { driverId: requester.id },
                { dispatcherId: requester.id },
              ],
            }),
      },
      include: {
        driver: { select: { id: true, name: true, role: true } },
        dispatcher: { select: { id: true, name: true, role: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  /** Read messages of a specific session, with access control. */
  async findMessagesBySession(
    sessionId: string,
    requester: { id: string; role: string },
  ) {
    const session = await this.prisma.tripChatSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Session not found');

    const isManager = requester.role === 'ADMIN' || requester.role === 'TEAMLEAD';
    const isParticipant =
      session.driverId === requester.id || session.dispatcherId === requester.id;

    if (!isManager && !isParticipant) {
      throw new ForbiddenException('No access to this chat session');
    }

    return this.prisma.message.findMany({
      where: { sessionId },
      include: { sender: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
