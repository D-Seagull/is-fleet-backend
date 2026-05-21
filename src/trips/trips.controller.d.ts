import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { AssignManagerDto, AssignTripDto, UpdateTripDto } from './dto/update-trip.dto';
export declare class TripsController {
    private tripsService;
    constructor(tripsService: TripsService);
    create(companyId: string, managerId: string, dto: CreateTripDto): Promise<{
        truck: {
            id: string;
            plate: string;
        };
        manager: {
            name: string | null;
            id: string;
        };
        documents: {
            id: string;
            createdAt: Date;
            tripId: string;
            isRead: boolean;
            fileUrl: string;
            fileName: string;
            uploadedBy: string;
            fileType: import(".prisma/client").$Enums.FileDocType;
            publicId: string | null;
        }[];
        driver: {
            name: string | null;
            id: string;
            phone: string | null;
        };
        stops: {
            id: string;
            tripId: string;
            type: import(".prisma/client").$Enums.StopType;
            order: number;
            address: string | null;
            ref: string | null;
            coords: string | null;
        }[];
    } & {
        id: string;
        companyId: string;
        createdAt: Date;
        managerId: string;
        status: import(".prisma/client").$Enums.TripStatus;
        driverId: string;
        title: string;
        truckId: string;
        notes: string | null;
        orderNumber: string | null;
        updatedAt: Date;
        chatResetAt: Date | null;
    }>;
    findAll(companyId: string): Promise<({
        truck: {
            id: string;
            plate: string;
        };
        manager: {
            name: string | null;
            id: string;
        };
        documents: {
            id: string;
            createdAt: Date;
            tripId: string;
            isRead: boolean;
            fileUrl: string;
            fileName: string;
            uploadedBy: string;
            fileType: import(".prisma/client").$Enums.FileDocType;
            publicId: string | null;
        }[];
        driver: {
            name: string | null;
            id: string;
            phone: string | null;
        };
        stops: {
            id: string;
            tripId: string;
            type: import(".prisma/client").$Enums.StopType;
            order: number;
            address: string | null;
            ref: string | null;
            coords: string | null;
        }[];
    } & {
        id: string;
        companyId: string;
        createdAt: Date;
        managerId: string;
        status: import(".prisma/client").$Enums.TripStatus;
        driverId: string;
        title: string;
        truckId: string;
        notes: string | null;
        orderNumber: string | null;
        updatedAt: Date;
        chatResetAt: Date | null;
    })[]>;
    broadcast(userId: string, companyId: string, content: string): Promise<{
        sent: number;
    }>;
    findByTruck(truckId: string, companyId: string): Promise<({
        truck: {
            id: string;
            plate: string;
        };
        manager: {
            name: string | null;
            id: string;
        };
        documents: {
            id: string;
            createdAt: Date;
            tripId: string;
            isRead: boolean;
            fileUrl: string;
            fileName: string;
            uploadedBy: string;
            fileType: import(".prisma/client").$Enums.FileDocType;
            publicId: string | null;
        }[];
        driver: {
            name: string | null;
            id: string;
            phone: string | null;
        };
        stops: {
            id: string;
            tripId: string;
            type: import(".prisma/client").$Enums.StopType;
            order: number;
            address: string | null;
            ref: string | null;
            coords: string | null;
        }[];
    } & {
        id: string;
        companyId: string;
        createdAt: Date;
        managerId: string;
        status: import(".prisma/client").$Enums.TripStatus;
        driverId: string;
        title: string;
        truckId: string;
        notes: string | null;
        orderNumber: string | null;
        updatedAt: Date;
        chatResetAt: Date | null;
    })[]>;
    findMyTrips(driverId: string): Promise<({
        truck: {
            id: string;
            plate: string;
        };
        manager: {
            name: string | null;
            id: string;
        };
        documents: {
            id: string;
            createdAt: Date;
            tripId: string;
            isRead: boolean;
            fileUrl: string;
            fileName: string;
            uploadedBy: string;
            fileType: import(".prisma/client").$Enums.FileDocType;
            publicId: string | null;
        }[];
        driver: {
            name: string | null;
            id: string;
            phone: string | null;
        };
        stops: {
            id: string;
            tripId: string;
            type: import(".prisma/client").$Enums.StopType;
            order: number;
            address: string | null;
            ref: string | null;
            coords: string | null;
        }[];
    } & {
        id: string;
        companyId: string;
        createdAt: Date;
        managerId: string;
        status: import(".prisma/client").$Enums.TripStatus;
        driverId: string;
        title: string;
        truckId: string;
        notes: string | null;
        orderNumber: string | null;
        updatedAt: Date;
        chatResetAt: Date | null;
    })[]>;
    findMyActiveTrip(driverId: string): Promise<({
        truck: {
            id: string;
            plate: string;
        };
        manager: {
            name: string | null;
            id: string;
        };
        documents: {
            id: string;
            createdAt: Date;
            tripId: string;
            isRead: boolean;
            fileUrl: string;
            fileName: string;
            uploadedBy: string;
            fileType: import(".prisma/client").$Enums.FileDocType;
            publicId: string | null;
        }[];
        driver: {
            name: string | null;
            id: string;
            phone: string | null;
        };
        stops: {
            id: string;
            tripId: string;
            type: import(".prisma/client").$Enums.StopType;
            order: number;
            address: string | null;
            ref: string | null;
            coords: string | null;
        }[];
    } & {
        id: string;
        companyId: string;
        createdAt: Date;
        managerId: string;
        status: import(".prisma/client").$Enums.TripStatus;
        driverId: string;
        title: string;
        truckId: string;
        notes: string | null;
        orderNumber: string | null;
        updatedAt: Date;
        chatResetAt: Date | null;
    }) | null>;
    findOne(id: string, companyId: string): Promise<{
        truck: {
            id: string;
            plate: string;
        };
        manager: {
            name: string | null;
            id: string;
        };
        documents: {
            id: string;
            createdAt: Date;
            tripId: string;
            isRead: boolean;
            fileUrl: string;
            fileName: string;
            uploadedBy: string;
            fileType: import(".prisma/client").$Enums.FileDocType;
            publicId: string | null;
        }[];
        driver: {
            name: string | null;
            id: string;
            phone: string | null;
        };
        stops: {
            id: string;
            tripId: string;
            type: import(".prisma/client").$Enums.StopType;
            order: number;
            address: string | null;
            ref: string | null;
            coords: string | null;
        }[];
    } & {
        id: string;
        companyId: string;
        createdAt: Date;
        managerId: string;
        status: import(".prisma/client").$Enums.TripStatus;
        driverId: string;
        title: string;
        truckId: string;
        notes: string | null;
        orderNumber: string | null;
        updatedAt: Date;
        chatResetAt: Date | null;
    }>;
    getMessages(id: string, companyId: string, userId: string, role: string): Promise<({
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
    updateInfo(id: string, companyId: string, dto: UpdateTripDto): Promise<{
        truck: {
            id: string;
            plate: string;
        };
        manager: {
            name: string | null;
            id: string;
        };
        documents: {
            id: string;
            createdAt: Date;
            tripId: string;
            isRead: boolean;
            fileUrl: string;
            fileName: string;
            uploadedBy: string;
            fileType: import(".prisma/client").$Enums.FileDocType;
            publicId: string | null;
        }[];
        driver: {
            name: string | null;
            id: string;
            phone: string | null;
        };
        stops: {
            id: string;
            tripId: string;
            type: import(".prisma/client").$Enums.StopType;
            order: number;
            address: string | null;
            ref: string | null;
            coords: string | null;
        }[];
    } & {
        id: string;
        companyId: string;
        createdAt: Date;
        managerId: string;
        status: import(".prisma/client").$Enums.TripStatus;
        driverId: string;
        title: string;
        truckId: string;
        notes: string | null;
        orderNumber: string | null;
        updatedAt: Date;
        chatResetAt: Date | null;
    }>;
    assignDriver(id: string, companyId: string, userId: string, dto: AssignTripDto): Promise<{
        truck: {
            id: string;
            plate: string;
        };
        manager: {
            name: string | null;
            id: string;
        };
        documents: {
            id: string;
            createdAt: Date;
            tripId: string;
            isRead: boolean;
            fileUrl: string;
            fileName: string;
            uploadedBy: string;
            fileType: import(".prisma/client").$Enums.FileDocType;
            publicId: string | null;
        }[];
        driver: {
            name: string | null;
            id: string;
            phone: string | null;
        };
        stops: {
            id: string;
            tripId: string;
            type: import(".prisma/client").$Enums.StopType;
            order: number;
            address: string | null;
            ref: string | null;
            coords: string | null;
        }[];
    } & {
        id: string;
        companyId: string;
        createdAt: Date;
        managerId: string;
        status: import(".prisma/client").$Enums.TripStatus;
        driverId: string;
        title: string;
        truckId: string;
        notes: string | null;
        orderNumber: string | null;
        updatedAt: Date;
        chatResetAt: Date | null;
    }>;
    assignManager(id: string, companyId: string, userId: string, dto: AssignManagerDto): Promise<{
        truck: {
            id: string;
            plate: string;
        };
        manager: {
            name: string | null;
            id: string;
        };
        documents: {
            id: string;
            createdAt: Date;
            tripId: string;
            isRead: boolean;
            fileUrl: string;
            fileName: string;
            uploadedBy: string;
            fileType: import(".prisma/client").$Enums.FileDocType;
            publicId: string | null;
        }[];
        driver: {
            name: string | null;
            id: string;
            phone: string | null;
        };
        stops: {
            id: string;
            tripId: string;
            type: import(".prisma/client").$Enums.StopType;
            order: number;
            address: string | null;
            ref: string | null;
            coords: string | null;
        }[];
    } & {
        id: string;
        companyId: string;
        createdAt: Date;
        managerId: string;
        status: import(".prisma/client").$Enums.TripStatus;
        driverId: string;
        title: string;
        truckId: string;
        notes: string | null;
        orderNumber: string | null;
        updatedAt: Date;
        chatResetAt: Date | null;
    }>;
    getChatArchive(id: string, companyId: string, userId: string, role: string): Promise<({
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
    getSessionMessages(sessionId: string, userId: string, role: string): Promise<({
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
    updateStatus(id: string, companyId: string, dto: UpdateTripDto): Promise<{
        id: string;
        companyId: string;
        createdAt: Date;
        managerId: string;
        status: import(".prisma/client").$Enums.TripStatus;
        driverId: string;
        title: string;
        truckId: string;
        notes: string | null;
        orderNumber: string | null;
        updatedAt: Date;
        chatResetAt: Date | null;
    }>;
    driverUpdateStatus(id: string, driverId: string, dto: UpdateTripDto): Promise<{
        id: string;
        companyId: string;
        createdAt: Date;
        managerId: string;
        status: import(".prisma/client").$Enums.TripStatus;
        driverId: string;
        title: string;
        truckId: string;
        notes: string | null;
        orderNumber: string | null;
        updatedAt: Date;
        chatResetAt: Date | null;
    }>;
    remove(id: string, companyId: string): Promise<{
        message: string;
    }>;
}
