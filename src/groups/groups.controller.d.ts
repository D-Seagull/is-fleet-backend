import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
export declare class GroupsController {
    private groupsService;
    constructor(groupsService: GroupsService);
    create(companyId: string, userId: string, role: string, dto: CreateGroupDto): Promise<{
        name: string;
        id: string;
        companyId: string;
        createdAt: Date;
        type: import(".prisma/client").$Enums.GroupType;
        createdBy: string;
    }>;
    findAll(companyId: string, role: string, userId: string): Promise<({
        managers: ({
            manager: {
                name: string | null;
                id: string;
            };
        } & {
            id: string;
            managerId: string;
            groupId: string;
        })[];
        trucks: ({
            truck: {
                id: string;
                isActive: boolean;
                companyId: string;
                createdAt: Date;
                managerId: string | null;
                plate: string;
                status: import(".prisma/client").$Enums.TruckStatus;
                currentDriverId: string | null;
            };
        } & {
            id: string;
            truckId: string;
            groupId: string;
        })[];
        creator: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        name: string;
        id: string;
        companyId: string;
        createdAt: Date;
        type: import(".prisma/client").$Enums.GroupType;
        createdBy: string;
    })[]>;
    findAllTrucks(companyId: string): Promise<({
        trucks: ({
            truck: {
                id: string;
                plate: string;
                status: import(".prisma/client").$Enums.TruckStatus;
                currentDriver: {
                    name: string | null;
                    id: string;
                } | null;
            };
        } & {
            id: string;
            truckId: string;
            groupId: string;
        })[];
        creator: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        name: string;
        id: string;
        companyId: string;
        createdAt: Date;
        type: import(".prisma/client").$Enums.GroupType;
        createdBy: string;
    })[]>;
    findAllManagers(companyId: string, role: string, userId: string): Promise<({
        managers: ({
            manager: {
                name: string | null;
                id: string;
            };
        } & {
            id: string;
            managerId: string;
            groupId: string;
        })[];
        creator: {
            name: string | null;
            id: string;
            role: import(".prisma/client").$Enums.Role;
        };
    } & {
        name: string;
        id: string;
        companyId: string;
        createdAt: Date;
        type: import(".prisma/client").$Enums.GroupType;
        createdBy: string;
    })[]>;
    update(id: string, userId: string, role: string, dto: UpdateGroupDto): Promise<{
        name: string;
        id: string;
        companyId: string;
        createdAt: Date;
        type: import(".prisma/client").$Enums.GroupType;
        createdBy: string;
    }>;
    remove(id: string, userId: string, role: string): Promise<{
        message: string;
    }>;
    addTruck(groupId: string, truckId: string, userId: string, role: string): Promise<{
        id: string;
        truckId: string;
        groupId: string;
    }>;
    removeTruck(groupId: string, truckId: string, userId: string, role: string): Promise<{
        message: string;
    }>;
    addManager(groupId: string, managerId: string): Promise<{
        id: string;
        managerId: string;
        groupId: string;
    }>;
    removeManager(groupId: string, managerId: string): Promise<{
        message: string;
    }>;
}
