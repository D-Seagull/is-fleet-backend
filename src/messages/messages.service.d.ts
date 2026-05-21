import { PrismaService } from "../prisma/prisma.service";
import { CreateMessageDto } from './dto/create-message.dto';
import { TranslationService } from "../translation/translation.service";
import { TripChatSessionsService } from './trip-chat-sessions.service';
import { PushService } from '../push/push.service';
import { MessagesGateway } from './messages.gateway';
export declare class MessagesService {
    private prisma;
    private translation;
    private sessions;
    private push;
    private gateway;
    constructor(prisma: PrismaService, translation: TranslationService, sessions: TripChatSessionsService, push: PushService, gateway: MessagesGateway);
    create(senderId: string, dto: CreateMessageDto): Promise<{
        sender: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
        session: {
            managerId: string | null;
            driverId: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        tripId: string;
        content: string;
        sessionId: string;
        senderId: string;
        translatedContent: string | null;
        isRead: boolean;
        isSystem: boolean;
    }>;
    remove(id: string, userId: string, userRole: string): Promise<{
        tripId: string;
    }>;
    getUnreadSummary(companyId: string, requesterId: string, requesterRole: string): Promise<{
        total: number;
        items: {
            truckId: string;
            plate: string;
            totalUnread: number;
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
        }[];
    }>;
    getDriverUnreadSummary(driverId: string): Promise<{
        total: number;
        activeTripUnread: number;
        pastTripsUnread: number;
        tripUnread: Record<string, number>;
        items: {
            tripId: string;
            unread: number;
            isActiveTrip: boolean;
            tripTitle: string;
            latestMessage: {
                content: string;
                senderName: string;
                createdAt: string;
            } | null;
        }[];
    }>;
    findByTrip(tripId: string, requester: {
        id: string;
        role: string;
    }): Promise<({
        sender: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        id: string;
        createdAt: Date;
        tripId: string;
        content: string;
        sessionId: string;
        senderId: string;
        translatedContent: string | null;
        isRead: boolean;
        isSystem: boolean;
    })[]>;
    markTripRead(tripId: string, readerId: string, readerRole: string): Promise<{
        messageIds: string[];
        documentIds: string[];
    }>;
}
