import { TripStatus } from '@prisma/client';
export declare class AssignTripDto {
    driverId: string;
}
export declare class AssignManagerDto {
    managerId: string;
}
export declare class UpdateStopDto {
    type: 'LOADING' | 'UNLOADING';
    order?: number;
    address?: string;
    ref?: string;
    coords?: string;
}
export declare class UpdateTripDto {
    status?: TripStatus;
    notes?: string;
    orderNumber?: string;
    stops?: UpdateStopDto[];
}
