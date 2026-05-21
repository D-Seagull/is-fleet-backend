import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { CreateCompanyDto } from './dto/create-company.dto';
export declare class AdminService {
    private prisma;
    private mail;
    constructor(prisma: PrismaService, mail: MailService);
    createCompany(dto: CreateCompanyDto): Promise<{
        company: {
            name: string;
            inviteToken: string | null;
            accountingEmail: string | null;
            hrEmail: string | null;
            directorEmail: string | null;
            id: string;
            isActive: boolean;
            createdAt: Date;
            inviteExpiry: Date | null;
            logo: string | null;
            logoPublicId: string | null;
        };
        inviteLink: string;
    }>;
    findAllCompanies(): Promise<({
        _count: {
            users: number;
        };
    } & {
        name: string;
        inviteToken: string | null;
        accountingEmail: string | null;
        hrEmail: string | null;
        directorEmail: string | null;
        id: string;
        isActive: boolean;
        createdAt: Date;
        inviteExpiry: Date | null;
        logo: string | null;
        logoPublicId: string | null;
    })[]>;
    deactivateCompany(id: string): Promise<{
        name: string;
        inviteToken: string | null;
        accountingEmail: string | null;
        hrEmail: string | null;
        directorEmail: string | null;
        id: string;
        isActive: boolean;
        createdAt: Date;
        inviteExpiry: Date | null;
        logo: string | null;
        logoPublicId: string | null;
    }>;
    resendInvite(id: string, email: string): Promise<{
        message: string;
    }>;
}
