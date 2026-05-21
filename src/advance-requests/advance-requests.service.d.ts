import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { ConfigService } from '@nestjs/config';
import { CreateAdvanceRequestDto } from './dto/create-advance-request.dto';
export declare class AdvanceRequestsService {
    private prisma;
    private mail;
    private config;
    constructor(prisma: PrismaService, mail: MailService, config: ConfigService);
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
