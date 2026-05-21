import { MessagesGateway } from './messages.gateway';
import { MessagesService } from './messages.service';
export declare class MessagesController {
    private readonly messagesService;
    private readonly gateway;
    constructor(messagesService: MessagesService, gateway: MessagesGateway);
    getUnreadSummary(companyId: string, userId: string, role: string): Promise<{
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
    getDriverUnreadSummary(userId: string): Promise<{
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
    remove(id: string, userId: string, role: string): Promise<{
        id: string;
    }>;
}
