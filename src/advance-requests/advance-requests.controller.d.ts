import { AdvanceRequestsService } from './advance-requests.service';
import { CreateAdvanceRequestDto } from './dto/create-advance-request.dto';
export declare class AdvanceRequestsController {
    private advanceRequestsService;
    constructor(advanceRequestsService: AdvanceRequestsService);
    create(driverId: string, companyId: string, dto: CreateAdvanceRequestDto): Promise<{
        id: string;
        companyId: string;
        createdAt: Date;
        driverId: string;
        amount: number;
        reason: string;
    }>;
    findMyRequests(userId: string, role: string): Promise<{
        id: string;
        companyId: string;
        createdAt: Date;
        driverId: string;
        amount: number;
        reason: string;
    }[]>;
}
