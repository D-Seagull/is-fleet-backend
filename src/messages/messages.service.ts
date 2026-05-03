import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { TranslationService } from 'src/translation/translation.service';

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private translation: TranslationService,
  ) {}
  async create(senderId: string, dto: CreateMessageDto) {
    let translatedContent: string | null = null;

    if (dto.translate) {
      // Знаходимо рейс і отримувача
      const trip = await this.prisma.trip.findFirst({
        where: { id: dto.tripId },
        include: {
          driver: { select: { id: true, language: true } },
          dispatcher: { select: { id: true, language: true } },
        },
      });

      // Визначаємо мову отримувача
      const receiver =
        trip?.driverId === senderId ? trip?.dispatcher : trip?.driver;
      const receiverLanguage = receiver?.language || 'EN';

      // Перекладаємо
      const targetCode = this.translation.getLanguageCode(receiverLanguage);
      translatedContent = await this.translation.translateText(
        dto.content,
        targetCode,
      );
    }

    return this.prisma.message.create({
      data: {
        tripId: dto.tripId,
        senderId,
        content: dto.content,
        translatedContent,
      },
      include: {
        sender: {
          select: { id: true, name: true, role: true },
        },
      },
    });
  }

  // Drivers can only delete their own; managers can delete any. Returns the
  // tripId so the controller can broadcast `messageDeleted` to the room.
  async remove(
    id: string,
    userId: string,
    userRole: string,
  ): Promise<{ tripId: string }> {
    const msg = await this.prisma.message.findUnique({ where: { id } });
    if (!msg) throw new NotFoundException('Повідомлення не знайдене');

    const isManager = ['ADMIN', 'TEAMLEAD', 'DISPATCHER'].includes(userRole);
    if (!isManager && msg.senderId !== userId) {
      throw new ForbiddenException('Ви не можете видалити це повідомлення');
    }

    await this.prisma.message.delete({ where: { id } });
    return { tripId: msg.tripId };
  }

  // Unread summary for the dispatcher — one DB round-trip,
  // grouped by truck, split into active-trip vs past-trip buckets.
  async getUnreadSummary(companyId: string, requesterId: string) {
    const ACTIVE_STATUSES = [
      'ASSIGNED', 'ACCEPTED', 'ON_WAY', 'ON_SITE', 'LOADED',
    ] as const;

    // One query: all unread msgs in the company not sent by the requester.
    const allUnread = await this.prisma.message.findMany({
      where: {
        trip: { companyId },
        isRead: false,
        senderId: { not: requesterId },
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        tripId: true,
        sender: { select: { name: true } },
        trip: {
          select: {
            status: true,
            truckId: true,
            chatResetAt: true,
            truck: { select: { plate: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    type TruckEntry = {
      plate: string;
      activeTripUnread: number;
      pastTripsUnread: number;
      tripUnread: Record<string, number>;
      latestMessage: {
        content: string;
        senderName: string;
        tripId: string;
        isActiveTrip: boolean;
        createdAt: string;
      } | null;
    };

    const truckMap = new Map<string, TruckEntry>();

    for (const msg of allUnread) {
      const { trip } = msg;

      // Respect chatResetAt — skip messages from previous driver session
      if (trip.chatResetAt && msg.createdAt < trip.chatResetAt) continue;

      const isActive = (ACTIVE_STATUSES as readonly string[]).includes(trip.status);
      const { truckId } = trip;

      if (!truckMap.has(truckId)) {
        truckMap.set(truckId, {
          plate: trip.truck.plate,
          activeTripUnread: 0,
          pastTripsUnread: 0,
          tripUnread: {},
          latestMessage: null,
        });
      }

      const entry = truckMap.get(truckId)!;

      if (isActive) entry.activeTripUnread++;
      else entry.pastTripsUnread++;

      entry.tripUnread[msg.tripId] = (entry.tripUnread[msg.tripId] ?? 0) + 1;

      // Messages are sorted desc → first one per truck is the latest
      if (!entry.latestMessage) {
        entry.latestMessage = {
          content: msg.content,
          senderName: msg.sender.name ?? 'Driver',
          tripId: msg.tripId,
          isActiveTrip: isActive,
          createdAt: msg.createdAt.toISOString(),
        };
      }
    }

    const items = [...truckMap.entries()]
      .map(([truckId, data]) => ({
        truckId,
        plate: data.plate,
        totalUnread: data.activeTripUnread + data.pastTripsUnread,
        activeTripUnread: data.activeTripUnread,
        pastTripsUnread: data.pastTripsUnread,
        tripUnread: data.tripUnread,
        latestMessage: data.latestMessage,
      }))
      .sort((a, b) => b.totalUnread - a.totalUnread);

    return {
      total: items.reduce((s, i) => s + i.totalUnread, 0),
      items,
    };
  }

  async findByTrip(tripId: string) {
    return this.prisma.message.findMany({
      where: { tripId },
      include: {
        sender: {
          select: { id: true, name: true, role: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Mark every unread message AND document in a trip *not authored/uploaded
  // by* `readerId` as read. Returns the IDs that were just flipped, so the
  // gateway can emit a precise event to the senders rather than refetching
  // the whole history.
  async markTripRead(
    tripId: string,
    readerId: string,
  ): Promise<{ messageIds: string[]; documentIds: string[] }> {
    const [unreadMessages, unreadDocs] = await Promise.all([
      this.prisma.message.findMany({
        where: { tripId, isRead: false, senderId: { not: readerId } },
        select: { id: true },
      }),
      this.prisma.tripDocument.findMany({
        where: { tripId, isRead: false, uploadedBy: { not: readerId } },
        select: { id: true },
      }),
    ]);

    const messageIds = unreadMessages.map((m) => m.id);
    const documentIds = unreadDocs.map((d) => d.id);

    await Promise.all([
      messageIds.length > 0
        ? this.prisma.message.updateMany({
            where: { id: { in: messageIds } },
            data: { isRead: true },
          })
        : Promise.resolve(),
      documentIds.length > 0
        ? this.prisma.tripDocument.updateMany({
            where: { id: { in: documentIds } },
            data: { isRead: true },
          })
        : Promise.resolve(),
    ]);

    return { messageIds, documentIds };
  }
}
