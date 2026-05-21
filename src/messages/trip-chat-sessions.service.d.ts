import { Prisma, SessionEndReason } from '@prisma/client';
import { PrismaService } from "../prisma/prisma.service";
export declare class TripChatSessionsService {
    private prisma;
    constructor(prisma: PrismaService);
    getActiveSession(tripId: string, tx?: Prisma.TransactionClient): Promise<{
        id: string;
        managerId: string | null;
        tripId: string;
        driverId: string | null;
        startedAt: Date;
        endedAt: Date | null;
        endReason: import(".prisma/client").$Enums.SessionEndReason | null;
    } | null>;
    getVisibleSessionIds(tripId: string, requester: {
        id: string;
        role: string;
    }): Promise<string[]>;
    getActiveSessionOrThrow(tripId: string, tx?: Prisma.TransactionClient): Promise<{
        id: string;
        managerId: string | null;
        tripId: string;
        driverId: string | null;
        startedAt: Date;
        endedAt: Date | null;
        endReason: import(".prisma/client").$Enums.SessionEndReason | null;
    }>;
    openInitial(tripId: string, driverId: string, managerId: string, tx?: Prisma.TransactionClient): Promise<{
        id: string;
        managerId: string | null;
        tripId: string;
        driverId: string | null;
        startedAt: Date;
        endedAt: Date | null;
        endReason: import(".prisma/client").$Enums.SessionEndReason | null;
    }>;
    closeAndOpenNew(tripId: string, reason: SessionEndReason, newDriverId: string, newManagerId: string, triggeredById: string): Promise<{
        session: {
            id: string;
            managerId: string | null;
            tripId: string;
            driverId: string | null;
            startedAt: Date;
            endedAt: Date | null;
            endReason: import(".prisma/client").$Enums.SessionEndReason | null;
        };
        systemMessage: {
            id: string;
            createdAt: Date;
            tripId: string;
            content: string;
            sessionId: string;
            senderId: string;
            translatedContent: string | null;
            isRead: boolean;
            isSystem: boolean;
        } | null;
    }>;
    closeActive(tripId: string, reason: SessionEndReason, tx?: Prisma.TransactionClient): Promise<{
        id: string;
        managerId: string | null;
        tripId: string;
        driverId: string | null;
        startedAt: Date;
        endedAt: Date | null;
        endReason: import(".prisma/client").$Enums.SessionEndReason | null;
    } | null>;
    findArchived(tripId: string, requester: {
        id: string;
        role: string;
    }): Promise<({
        manager: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        } | null;
        driver: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        } | null;
    } & {
        id: string;
        managerId: string | null;
        tripId: string;
        driverId: string | null;
        startedAt: Date;
        endedAt: Date | null;
        endReason: import(".prisma/client").$Enums.SessionEndReason | null;
    })[]>;
    findMessagesBySession(sessionId: string, requester: {
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
}
