"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = __importStar(require("bcrypt"));
const sms_service_1 = require("../sms/sms.service");
const phone_1 = require("../common/utils/phone");
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
let AuthService = AuthService_1 = class AuthService {
    prisma;
    jwt;
    sms;
    logger = new common_1.Logger(AuthService_1.name);
    constructor(prisma, jwt, sms) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.sms = sms;
    }
    async adminLogin(dto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        if (!user || user.role !== 'ADMIN') {
            throw new common_1.UnauthorizedException('Немає доступу');
        }
        const valid = await bcrypt.compare(dto.password, user.password);
        if (!valid)
            throw new common_1.UnauthorizedException('Невірний email або пароль');
        return this.signToken(user.id, user.role, user.companyId, user.name ?? '');
    }
    async register(dto) {
        const existingUser = await this.prisma.user.findFirst({
            where: {
                inviteToken: dto.inviteToken,
                inviteExpiry: { gt: new Date() },
            },
        });
        if (existingUser) {
            const hash = await bcrypt.hash(dto.password, 10);
            const user = await this.prisma.user.update({
                where: { id: existingUser.id },
                data: {
                    name: dto.name,
                    password: hash,
                    inviteToken: null,
                    inviteExpiry: null,
                },
            });
            return this.signToken(user.id, user.role, user.companyId, user.name ?? '');
        }
        const company = await this.prisma.company.findFirst({
            where: {
                inviteToken: dto.inviteToken,
            },
            include: {
                users: { where: { role: 'TEAMLEAD' } },
            },
        });
        if (!company)
            throw new common_1.BadRequestException('Невірний або прострочений токен');
        const hash = await bcrypt.hash(dto.password, 10);
        const user = await this.prisma.user.create({
            data: {
                name: dto.name,
                email: dto.email,
                password: hash,
                role: 'TEAMLEAD',
                companyId: company.id,
            },
        });
        if (company.users.length === 0) {
            await this.prisma.company.update({
                where: { id: company.id },
                data: {
                    accountingEmail: dto.accountingEmail,
                    hrEmail: dto.hrEmail,
                    directorEmail: dto.directorEmail,
                },
            });
        }
        return this.signToken(user.id, user.role, user.companyId, user.name ?? '');
    }
    async login(dto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        if (!user)
            throw new common_1.UnauthorizedException('Login or password is wrong');
        const valid = await bcrypt.compare(dto.password, user.password);
        if (!valid)
            throw new common_1.UnauthorizedException('Login or password is wrong');
        return this.signToken(user.id, user.role, user.companyId, user.name ?? '');
    }
    signToken(userId, role, companyId, name) {
        const payload = { sub: userId, role, companyId };
        console.log(payload);
        return {
            access_token: this.jwt.sign(payload),
            user: {
                id: userId,
                role,
                companyId,
                name,
            },
        };
    }
    async getMe(userId) {
        return this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                phone: true,
                role: true,
                companyId: true,
                email: true,
                language: true,
                timezone: true,
                avatar: true,
                currentTruck: {
                    select: {
                        id: true,
                        plate: true,
                        status: true,
                    },
                },
                manager: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        avatar: true,
                    },
                },
            },
        });
    }
    async checkInvite(token) {
        const user = await this.prisma.user.findFirst({
            where: {
                inviteToken: token,
                inviteExpiry: { gt: new Date() },
            },
            include: { company: true },
        });
        if (user) {
            return {
                type: 'user',
                role: user.role,
                companyName: user.company.name,
                isFirstUser: false,
            };
        }
        const company = await this.prisma.company.findFirst({
            where: { inviteToken: token },
            include: {
                users: { where: { role: 'TEAMLEAD' } },
            },
        });
        if (!company)
            throw new common_1.BadRequestException('Невірний токен');
        return {
            type: 'company',
            role: 'TEAMLEAD',
            companyName: company.name,
            isFirstUser: company.users.length === 0,
        };
    }
    async requestDriverOtp(phoneInput) {
        const phone = (0, phone_1.normalizePhone)(phoneInput);
        this.logger.log(`requestDriverOtp called: input="${phoneInput}" → normalized="${phone ?? 'INVALID'}"`);
        if (!phone) {
            return { ok: true };
        }
        const user = await this.prisma.user.findUnique({ where: { phone } });
        if (!user || user.role !== 'DRIVER' || !user.isActive) {
            this.logger.warn(`OTP request for ${phone}: no active DRIVER row found — returning ok:true silently`);
            return { ok: true };
        }
        const lastSent = await this.prisma.otpCode.findFirst({
            where: {
                phone,
                createdAt: { gt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) },
            },
            orderBy: { createdAt: 'desc' },
        });
        if (lastSent) {
            throw new common_1.HttpException('Please wait before requesting another code.', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + OTP_TTL_MS);
        await this.prisma.otpCode.create({
            data: { phone, code, userId: user.id, expiresAt },
        });
        await this.sms.send(phone, `Your IS Fleet code: ${code}`);
        return { ok: true };
    }
    async verifyDriverOtp(phoneInput, code) {
        const phone = (0, phone_1.normalizePhone)(phoneInput);
        this.logger.log(`verifyDriverOtp called: input="${phoneInput}" → normalized="${phone ?? 'INVALID'}", code=${code}`);
        if (!phone) {
            throw new common_1.UnauthorizedException('Code is invalid or expired.');
        }
        const otp = await this.prisma.otpCode.findFirst({
            where: {
                phone,
                usedAt: null,
                expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
            include: { user: true },
        });
        if (!otp) {
            throw new common_1.UnauthorizedException('Code is invalid or expired.');
        }
        if (otp.attempts >= OTP_MAX_ATTEMPTS) {
            await this.prisma.otpCode.update({
                where: { id: otp.id },
                data: { usedAt: new Date() },
            });
            throw new common_1.UnauthorizedException('Too many attempts. Please request a new code.');
        }
        if (otp.code !== code) {
            await this.prisma.otpCode.update({
                where: { id: otp.id },
                data: { attempts: { increment: 1 } },
            });
            throw new common_1.UnauthorizedException('Code is invalid or expired.');
        }
        if (otp.user.role !== 'DRIVER' || !otp.user.isActive) {
            throw new common_1.ForbiddenException('Driver account is not active.');
        }
        await this.prisma.otpCode.updateMany({
            where: { phone, usedAt: null },
            data: { usedAt: new Date() },
        });
        return this.signToken(otp.user.id, otp.user.role, otp.user.companyId, otp.user.name ?? '');
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        sms_service_1.SmsService])
], AuthService);
//# sourceMappingURL=auth.service.js.map