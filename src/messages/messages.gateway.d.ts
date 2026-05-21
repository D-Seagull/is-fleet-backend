import { Server, Socket } from 'socket.io';
import { MessagesService } from './messages.service';
import { PrismaService } from "../prisma/prisma.service";
import { CreateMessageDto } from './dto/create-message.dto';
import { JoinTripDto } from './dto/join-trip.dto';
import { JwtService } from '@nestjs/jwt';
export declare class MessagesGateway {
    private messagesService;
    private jwtService;
    private prisma;
    server: Server;
    constructor(messagesService: MessagesService, jwtService: JwtService, prisma: PrismaService);
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleJoinTrip(client: Socket, body: JoinTripDto): Promise<void>;
    handleTripMessage(client: Socket, dto: CreateMessageDto): Promise<({
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
    }) | undefined>;
    handleMarkTripRead(client: Socket, body: JoinTripDto): Promise<void>;
    handleTyping(client: Socket, body: JoinTripDto): Promise<void>;
    handleStopTyping(client: Socket, body: JoinTripDto): void;
    emitNewDocument(tripId: string, doc: unknown): void;
    emitDocumentDeleted(tripId: string, documentId: string): void;
    emitMessageDeleted(tripId: string, messageId: string): void;
    isUserOnline(userId: string): Promise<boolean>;
    handleAppActive(client: Socket): void;
    handleAppBackground(client: Socket): void;
}
