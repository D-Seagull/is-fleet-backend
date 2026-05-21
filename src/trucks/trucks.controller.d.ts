import { TrucksService } from './trucks.service';
import { CreateTruckDto } from './dto/create-truck.dto';
import { UpdateTruckDto } from './dto/update-truck.dto';
import { CreateTruckNoteDto } from './dto/create-truck-note.dto';
export declare class TrucksController {
    private trucksService;
    constructor(trucksService: TrucksService);
    create(companyId: string, dto: CreateTruckDto): Promise<{
        id: string;
        isActive: boolean;
        companyId: string;
        createdAt: Date;
        managerId: string | null;
        plate: string;
        status: import(".prisma/client").$Enums.TruckStatus;
        currentDriverId: string | null;
    }>;
    findAll(companyId: string): Promise<({
        manager: {
            name: string | null;
            id: string;
        } | null;
        truckNotes: {
            createdAt: Date;
            content: string;
        }[];
        currentDriver: {
            name: string | null;
            id: string;
            phone: string | null;
        } | null;
    } & {
        id: string;
        isActive: boolean;
        companyId: string;
        createdAt: Date;
        managerId: string | null;
        plate: string;
        status: import(".prisma/client").$Enums.TruckStatus;
        currentDriverId: string | null;
    })[]>;
    findDriverTruck(userId: string): Promise<({
        manager: {
            name: string | null;
            id: string;
            phone: string | null;
            avatar: string | null;
        } | null;
        truckNotes: ({
            user: {
                name: string | null;
                id: string;
                role: import(".prisma/client").$Enums.Role;
            };
        } & {
            id: string;
            createdAt: Date;
            userId: string;
            content: string;
            truckId: string;
        })[];
    } & {
        id: string;
        isActive: boolean;
        companyId: string;
        createdAt: Date;
        managerId: string | null;
        plate: string;
        status: import(".prisma/client").$Enums.TruckStatus;
        currentDriverId: string | null;
    }) | null>;
    findMy(userId: string, companyId: string): Promise<({
        truckNotes: {
            createdAt: Date;
            content: string;
        }[];
        currentDriver: {
            name: string | null;
            id: string;
            phone: string | null;
        } | null;
    } & {
        id: string;
        isActive: boolean;
        companyId: string;
        createdAt: Date;
        managerId: string | null;
        plate: string;
        status: import(".prisma/client").$Enums.TruckStatus;
        currentDriverId: string | null;
    })[]>;
    findDeactivated(companyId: string): Promise<({
        currentDriver: {
            name: string | null;
            id: string;
            phone: string | null;
        } | null;
    } & {
        id: string;
        isActive: boolean;
        companyId: string;
        createdAt: Date;
        managerId: string | null;
        plate: string;
        status: import(".prisma/client").$Enums.TruckStatus;
        currentDriverId: string | null;
    })[]>;
    activate(id: string, companyId: string): Promise<{
        message: string;
    }>;
    findOne(id: string, companyId: string): Promise<{
        manager: {
            name: string | null;
            id: string;
        } | null;
        currentDriver: {
            name: string | null;
            id: string;
            phone: string | null;
        } | null;
    } & {
        id: string;
        isActive: boolean;
        companyId: string;
        createdAt: Date;
        managerId: string | null;
        plate: string;
        status: import(".prisma/client").$Enums.TruckStatus;
        currentDriverId: string | null;
    }>;
    update(id: string, companyId: string, userId: string, dto: UpdateTruckDto): Promise<{
        id: string;
        isActive: boolean;
        companyId: string;
        createdAt: Date;
        managerId: string | null;
        plate: string;
        status: import(".prisma/client").$Enums.TruckStatus;
        currentDriverId: string | null;
    }>;
    remove(id: string, companyId: string): Promise<{
        message: string;
    }>;
    createNote(truckId: string, companyId: string, userId: string, dto: CreateTruckNoteDto): Promise<({
        user: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        content: string;
        truckId: string;
    }) | undefined>;
    getNotes(truckId: string): Promise<({
        user: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        content: string;
        truckId: string;
    })[]>;
    removeNote(id: string, userId: string): Promise<{
        message: string;
    }>;
}
