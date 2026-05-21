import { PrismaService } from "../prisma/prisma.service";
import { SupabaseStorageService } from "../supabase-storage/supabase-storage.service";
import { MessagesGateway } from '../messages/messages.gateway';
export declare class DocumentsService {
    private prisma;
    private storage;
    private gateway;
    constructor(prisma: PrismaService, storage: SupabaseStorageService, gateway: MessagesGateway);
    uploadMany(tripId: string, uploadedBy: string, files: Express.Multer.File[]): Promise<{
        signedUrl: string;
        trip: {
            truck: {
                id: string;
                plate: string;
            };
            id: string;
            title: string;
            orderNumber: string | null;
        };
        uploader: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
        id: string;
        createdAt: Date;
        tripId: string;
        isRead: boolean;
        fileUrl: string;
        fileName: string;
        uploadedBy: string;
        fileType: import(".prisma/client").$Enums.FileDocType;
        publicId: string | null;
    }[]>;
    remove(id: string, userId: string, userRole: string): Promise<{
        message: string;
    }>;
    view(id: string): Promise<{
        url: string;
    }>;
    download(id: string): Promise<{
        url: string;
    }>;
    private withSignedUrl;
    findByTrip(tripId: string): Promise<({
        uploader: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        id: string;
        createdAt: Date;
        tripId: string;
        isRead: boolean;
        fileUrl: string;
        fileName: string;
        uploadedBy: string;
        fileType: import(".prisma/client").$Enums.FileDocType;
        publicId: string | null;
    } & {
        signedUrl: string;
    })[]>;
    findByTruck(truckId: string): Promise<({
        trip: {
            id: string;
            title: string;
            orderNumber: string | null;
        };
        uploader: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        id: string;
        createdAt: Date;
        tripId: string;
        isRead: boolean;
        fileUrl: string;
        fileName: string;
        uploadedBy: string;
        fileType: import(".prisma/client").$Enums.FileDocType;
        publicId: string | null;
    } & {
        signedUrl: string;
    })[]>;
    findByCompany(companyId: string): Promise<({
        trip: {
            truck: {
                id: string;
                plate: string;
            };
            id: string;
            title: string;
            orderNumber: string | null;
        };
        uploader: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        id: string;
        createdAt: Date;
        tripId: string;
        isRead: boolean;
        fileUrl: string;
        fileName: string;
        uploadedBy: string;
        fileType: import(".prisma/client").$Enums.FileDocType;
        publicId: string | null;
    } & {
        signedUrl: string;
    })[]>;
}
