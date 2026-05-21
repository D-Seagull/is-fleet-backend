import { CompaniesService } from './companies.service';
export declare class CompaniesController {
    private companiesService;
    constructor(companiesService: CompaniesService);
    getCompany(companyId: string): Promise<{
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
    uploadLogo(companyId: string, file: Express.Multer.File): Promise<{
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
    updateLogo(companyId: string, file: Express.Multer.File): Promise<{
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
    deleteLogo(companyId: string): Promise<{
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
    updateEmails(companyId: string, dto: {
        accountingEmail?: string;
        hrEmail?: string;
        directorEmail?: string;
    }): Promise<{
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
}
