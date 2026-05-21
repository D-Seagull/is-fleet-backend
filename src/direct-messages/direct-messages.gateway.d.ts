import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { DirectMessagesService } from './direct-messages.service';
import { GroupMessagesService } from "../group-messages/group-messages.service";
export declare class DirectMessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private service;
    private groupService;
    private jwt;
    server: Server;
    constructor(service: DirectMessagesService, groupService: GroupMessagesService, jwt: JwtService);
    handleConnection(client: Socket): Promise<void>;
    handleDisconnect(client: Socket): void;
    handleMessage(client: Socket, data: {
        receiverId: string;
        content: string;
    }): Promise<{
        sender: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        id: string;
        createdAt: Date;
        content: string;
        senderId: string;
        isRead: boolean;
        receiverId: string;
    }>;
    handleTypingStart(client: Socket, data: {
        receiverId: string;
    }): void;
    handleTypingStop(client: Socket, data: {
        receiverId: string;
    }): void;
    handleMarkAsRead(client: Socket, data: {
        senderId: string;
    }): Promise<void>;
    handleJoinGroup(client: Socket, data: {
        groupId: string;
    }): Promise<void>;
    handleLeaveGroup(client: Socket, data: {
        groupId: string;
    }): Promise<void>;
    handleGroupMessage(client: Socket, data: {
        groupId: string;
        content: string;
    }): Promise<{
        sender: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        id: string;
        createdAt: Date;
        content: string;
        senderId: string;
        groupId: string;
    }>;
    handleGroupTyping(client: Socket, data: {
        groupId: string;
        name: string;
    }): void;
    handleGroupStoppedTyping(client: Socket, data: {
        groupId: string;
    }): void;
}
