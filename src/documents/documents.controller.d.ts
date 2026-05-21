import { DocumentsService } from './documents.service';
export declare class DocumentsController {
    private documentsService;
    constructor(documentsService: DocumentsService);
    uploadMany(files: Express.Multer.File[], tripId: string, userId: string): Promise<{
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
    findAll(companyId: string): Promise<({
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
    view(id: string): Promise<{
        url: string;
    }>;
    download(id: string): Promise<{
        url: string;
    }>;
    remove(id: string, userId: string, role: string): Promise<{
        message: string;
    }>;
}
