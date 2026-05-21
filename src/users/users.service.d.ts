import { PrismaService } from "../prisma/prisma.service";
import { CreateManagerDto } from './dto/create-manager.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { SupabaseStorageService } from "../supabase-storage/supabase-storage.service";
import { MailService } from "../mail/mail.service";
import { MessagesGateway } from "../messages/messages.gateway";
import { PushService } from "../push/push.service";
export declare class UsersService {
    private prisma;
    private storage;
    private mail;
    private gateway;
    private push;
    constructor(prisma: PrismaService, storage: SupabaseStorageService, mail: MailService, gateway: MessagesGateway, push: PushService);
    createManager(companyId: string, creatorId: string, dto: CreateManagerDto): Promise<{
        name: string | null;
        email: string | null;
        password: string | null;
        inviteToken: string | null;
        id: string;
        phone: string | null;
        avatar: string | null;
        avatarPublicId: string | null;
        role: import(".prisma/client").$Enums.Role;
        language: import(".prisma/client").$Enums.Language;
        timezone: string | null;
        isActive: boolean;
        companyId: string;
        createdAt: Date;
        managerId: string | null;
        teamleadId: string | null;
        inviteExpiry: Date | null;
    }>;
    createDriver(companyId: string, creatorId: string, dto: CreateDriverDto): Promise<{
        name: string | null;
        email: string | null;
        inviteToken: string | null;
        id: string;
        phone: string | null;
        avatar: string | null;
        avatarPublicId: string | null;
        role: import(".prisma/client").$Enums.Role;
        language: import(".prisma/client").$Enums.Language;
        timezone: string | null;
        isActive: boolean;
        companyId: string;
        createdAt: Date;
        managerId: string | null;
        teamleadId: string | null;
        inviteExpiry: Date | null;
    }>;
    getCompanyUsers(companyId: string | null): Promise<{
        ratingCount: number;
        averageRating: number | null;
        managerRatingCount: number;
        managerAverageRating: number | null;
        truckCount: number;
        company: {
            name: string;
        };
        name: string | null;
        email: string | null;
        id: string;
        phone: string | null;
        avatar: string | null;
        role: import(".prisma/client").$Enums.Role;
        language: import(".prisma/client").$Enums.Language;
        isActive: boolean;
        createdAt: Date;
        managerId: string | null;
        teamleadId: string | null;
        manager: {
            name: string | null;
            id: string;
        } | null;
        teamlead: {
            name: string | null;
            id: string;
        } | null;
        currentTruck: {
            id: string;
            plate: string;
            status: import(".prisma/client").$Enums.TruckStatus;
        } | null;
    }[]>;
    updateDriver(id: string, companyId: string | null, dto: {
        name?: string;
        phone?: string;
        language?: 'UK' | 'EN' | 'PL' | 'LT' | 'UZ' | 'KZ' | 'HI' | 'RU';
        managerId?: string | null;
        teamleadId?: string | null;
        truckId?: string | null;
    }): Promise<{
        name: string | null;
        id: string;
        phone: string | null;
        language: import(".prisma/client").$Enums.Language;
        managerId: string | null;
        teamleadId: string | null;
        manager: {
            name: string | null;
            id: string;
        } | null;
        teamlead: {
            name: string | null;
            id: string;
        } | null;
        currentTruck: {
            id: string;
            plate: string;
            status: import(".prisma/client").$Enums.TruckStatus;
        } | null;
    }>;
    activate(id: string, companyId: string | null): Promise<{
        message: string;
    }>;
    deactivate(id: string, companyId: string | null, requesterRole: string): Promise<{
        message: string;
    }>;
    getUserById(id: string): Promise<{
        ratingsReceived: {
            anonymous: boolean;
            ratedBy: {
                name: string | null;
                id: string;
                role: import(".prisma/client").$Enums.Role;
            } | {
                id: string;
                name: string;
                role: string;
            };
            id: string;
            createdAt: Date;
            score: number;
            comment: string | null;
        }[];
        averageRating: number | null;
        ratingCount: number;
        managerRatingsReceived: {
            anonymous: boolean;
            ratedBy: {
                name: string | null;
                id: string;
                role: import(".prisma/client").$Enums.Role;
            } | {
                id: string;
                name: string;
                role: string;
            };
            id: string;
            createdAt: Date;
            score: number;
            comment: string | null;
        }[];
        managerAverageRating: number | null;
        managerRatingCount: number;
        name: string | null;
        email: string | null;
        id: string;
        phone: string | null;
        avatar: string | null;
        role: import(".prisma/client").$Enums.Role;
        language: import(".prisma/client").$Enums.Language;
        isActive: boolean;
        companyId: string;
        createdAt: Date;
        teamleadId: string | null;
        manager: {
            name: string | null;
            email: string | null;
            id: string;
            phone: string | null;
            avatar: string | null;
        } | null;
        teamlead: {
            name: string | null;
            email: string | null;
            id: string;
            phone: string | null;
            avatar: string | null;
        } | null;
        drivers: {
            name: string | null;
            id: string;
            phone: string | null;
            avatar: string | null;
            currentTruck: {
                id: string;
                plate: string;
            } | null;
        }[];
        currentTruck: {
            id: string;
            plate: string;
            status: import(".prisma/client").$Enums.TruckStatus;
        } | null;
        assignedTrucks: {
            id: string;
            plate: string;
            status: import(".prisma/client").$Enums.TruckStatus;
            currentDriver: {
                name: string | null;
                id: string;
            } | null;
        }[];
    }>;
    upsertRating(driverId: string, ratedById: string, score: number, comment?: string, anonymous?: boolean): Promise<{
        id: string;
        createdAt: Date;
        driverId: string;
        ratedById: string;
        score: number;
        comment: string | null;
        anonymous: boolean;
    }>;
    getDriverRatings(driverId: string): Promise<{
        ratings: {
            anonymous: boolean;
            ratedBy: {
                name: string | null;
                id: string;
                role: import(".prisma/client").$Enums.Role;
            } | {
                id: string;
                name: string;
                role: string;
            };
            id: string;
            createdAt: Date;
            score: number;
            comment: string | null;
        }[];
        averageRating: number | null;
        ratingCount: number;
    }>;
    upsertManagerRating(managerId: string, ratedById: string, companyId: string, score: number, comment?: string, anonymous?: boolean): Promise<{
        id: string;
        createdAt: Date;
        managerId: string;
        ratedById: string;
        score: number;
        comment: string | null;
        anonymous: boolean;
    }>;
    getManagerRatings(managerId: string): Promise<{
        ratings: {
            anonymous: boolean;
            ratedBy: {
                name: string | null;
                id: string;
                role: import(".prisma/client").$Enums.Role;
            } | {
                id: string;
                name: string;
                role: string;
            };
            id: string;
            createdAt: Date;
            score: number;
            comment: string | null;
        }[];
        averageRating: number | null;
        ratingCount: number;
    }>;
    uploadAvatar(userId: string, file: Express.Multer.File): Promise<{
        name: string | null;
        email: string | null;
        password: string | null;
        inviteToken: string | null;
        id: string;
        phone: string | null;
        avatar: string | null;
        avatarPublicId: string | null;
        role: import(".prisma/client").$Enums.Role;
        language: import(".prisma/client").$Enums.Language;
        timezone: string | null;
        isActive: boolean;
        companyId: string;
        createdAt: Date;
        managerId: string | null;
        teamleadId: string | null;
        inviteExpiry: Date | null;
    }>;
    deleteAvatar(userId: string): Promise<{
        name: string | null;
        email: string | null;
        password: string | null;
        inviteToken: string | null;
        id: string;
        phone: string | null;
        avatar: string | null;
        avatarPublicId: string | null;
        role: import(".prisma/client").$Enums.Role;
        language: import(".prisma/client").$Enums.Language;
        timezone: string | null;
        isActive: boolean;
        companyId: string;
        createdAt: Date;
        managerId: string | null;
        teamleadId: string | null;
        inviteExpiry: Date | null;
    }>;
    registerPushToken(userId: string, token: string, platform?: 'ios' | 'android' | 'web'): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        token: string;
        updatedAt: Date;
        platform: string | null;
    }>;
    deletePushToken(userId: string, token: string): Promise<{
        ok: boolean;
    }>;
    setTimezone(userId: string, timezone: string): Promise<{
        id: string;
        timezone: string | null;
    }>;
}
