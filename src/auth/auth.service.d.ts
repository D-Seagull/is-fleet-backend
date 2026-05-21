import { PrismaService } from "../prisma/prisma.service";
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SmsService } from "../sms/sms.service";
export declare class AuthService {
    private prisma;
    private jwt;
    private sms;
    private readonly logger;
    constructor(prisma: PrismaService, jwt: JwtService, sms: SmsService);
    adminLogin(dto: LoginDto): Promise<{
        access_token: string;
        user: {
            id: string;
            role: string;
            companyId: string;
            name: string;
        };
    }>;
    register(dto: RegisterDto): Promise<{
        access_token: string;
        user: {
            id: string;
            role: string;
            companyId: string;
            name: string;
        };
    }>;
    login(dto: LoginDto): Promise<{
        access_token: string;
        user: {
            id: string;
            role: string;
            companyId: string;
            name: string;
        };
    }>;
    private signToken;
    getMe(userId: string): Promise<{
        name: string | null;
        email: string | null;
        id: string;
        phone: string | null;
        avatar: string | null;
        role: import(".prisma/client").$Enums.Role;
        language: import(".prisma/client").$Enums.Language;
        timezone: string | null;
        companyId: string;
        manager: {
            name: string | null;
            id: string;
            phone: string | null;
            avatar: string | null;
        } | null;
        currentTruck: {
            id: string;
            plate: string;
            status: import(".prisma/client").$Enums.TruckStatus;
        } | null;
    } | null>;
    checkInvite(token: string): Promise<{
        type: string;
        role: string;
        companyName: string;
        isFirstUser: boolean;
    }>;
    requestDriverOtp(phoneInput: string): Promise<{
        ok: boolean;
    }>;
    verifyDriverOtp(phoneInput: string, code: string): Promise<{
        access_token: string;
        user: {
            id: string;
            role: string;
            companyId: string;
            name: string;
        };
    }>;
}
