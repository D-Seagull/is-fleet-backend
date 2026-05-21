export declare class TripStopDto {
    type: 'LOADING' | 'UNLOADING';
    order?: number;
    address?: string;
    ref?: string;
    coords?: string;
}
export declare class CreateTripDto {
    title: string;
    driverId: string;
    truckId: string;
    notes?: string;
    orderNumber?: string;
    stops?: TripStopDto[];
}
