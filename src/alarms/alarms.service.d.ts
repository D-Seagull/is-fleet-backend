import { PrismaService } from "../prisma/prisma.service";
import { PushService } from "../push/push.service";
import { CreateAlarmDto } from './dto/create-alarm.dto';
import { UpdateAlarmDto } from './dto/update-alarm.dto';
import { MessagesGateway } from "../messages/messages.gateway";
export declare class AlarmsService {
    private prisma;
    private push;
    private gateway;
    private readonly logger;
    constructor(prisma: PrismaService, push: PushService, gateway: MessagesGateway);
    private canTarget;
    create(creatorId: string, creatorRole: string, creatorCompanyId: string, dto: CreateAlarmDto): Promise<{
        trip: {
            id: string;
            title: string;
            truckId: string;
        } | null;
        target: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
        creator: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        id: string;
        companyId: string;
        createdAt: Date;
        tripId: string | null;
        title: string;
        updatedAt: Date;
        createdById: string;
        targetUserId: string;
        note: string | null;
        time: Date;
        recurrence: import(".prisma/client").$Enums.AlarmRecurrence;
        isSent: boolean;
    }>;
    findMy(userId: string): Promise<({
        trip: {
            id: string;
            title: string;
            truckId: string;
        } | null;
        target: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
        creator: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        id: string;
        companyId: string;
        createdAt: Date;
        tripId: string | null;
        title: string;
        updatedAt: Date;
        createdById: string;
        targetUserId: string;
        note: string | null;
        time: Date;
        recurrence: import(".prisma/client").$Enums.AlarmRecurrence;
        isSent: boolean;
    })[]>;
    findCreated(userId: string): Promise<({
        trip: {
            id: string;
            title: string;
            truckId: string;
        } | null;
        target: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
        creator: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        id: string;
        companyId: string;
        createdAt: Date;
        tripId: string | null;
        title: string;
        updatedAt: Date;
        createdById: string;
        targetUserId: string;
        note: string | null;
        time: Date;
        recurrence: import(".prisma/client").$Enums.AlarmRecurrence;
        isSent: boolean;
    })[]>;
    findByTrip(tripId: string, requester: {
        id: string;
        role: string;
        companyId: string;
    }): Promise<({
        trip: {
            id: string;
            title: string;
            truckId: string;
        } | null;
        target: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
        creator: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        id: string;
        companyId: string;
        createdAt: Date;
        tripId: string | null;
        title: string;
        updatedAt: Date;
        createdById: string;
        targetUserId: string;
        note: string | null;
        time: Date;
        recurrence: import(".prisma/client").$Enums.AlarmRecurrence;
        isSent: boolean;
    })[]>;
    findByTruck(truckId: string, requester: {
        id: string;
        role: string;
        companyId: string;
    }): Promise<({
        trip: {
            id: string;
            title: string;
            truckId: string;
        } | null;
        target: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
        creator: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        id: string;
        companyId: string;
        createdAt: Date;
        tripId: string | null;
        title: string;
        updatedAt: Date;
        createdById: string;
        targetUserId: string;
        note: string | null;
        time: Date;
        recurrence: import(".prisma/client").$Enums.AlarmRecurrence;
        isSent: boolean;
    })[]>;
    update(id: string, userId: string, dto: UpdateAlarmDto): Promise<{
        trip: {
            id: string;
            title: string;
            truckId: string;
        } | null;
        target: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
        creator: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        id: string;
        companyId: string;
        createdAt: Date;
        tripId: string | null;
        title: string;
        updatedAt: Date;
        createdById: string;
        targetUserId: string;
        note: string | null;
        time: Date;
        recurrence: import(".prisma/client").$Enums.AlarmRecurrence;
        isSent: boolean;
    }>;
    remove(id: string, userId: string): Promise<{
        ok: boolean;
    }>;
    checkAlarms(): Promise<void>;
}
