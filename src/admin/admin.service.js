"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const mail_service_1 = require("../mail/mail.service");
const uuid_1 = require("uuid");
let AdminService = class AdminService {
    prisma;
    mail;
    constructor(prisma, mail) {
        this.prisma = prisma;
        this.mail = mail;
    }
    async createCompany(dto) {
        const inviteToken = (0, uuid_1.v4)();
        const inviteExpiry = new Date();
        inviteExpiry.setDate(inviteExpiry.getDate() + 7);
        const existing = await this.prisma.company.findFirst({
            where: {
                name: dto.name,
            },
        });
        if (existing)
            throw new common_1.BadRequestException('Company with this name already created');
        const company = await this.prisma.company.create({
            data: {
                name: dto.name,
                inviteToken,
                inviteExpiry,
            },
        });
        const inviteLink = `${process.env.FRONTEND_URL}/register?token=${inviteToken}`;
        await this.mail.sendCompanyInvite(dto.email, dto.name, inviteLink);
        return {
            company,
            inviteLink,
        };
    }
    async findAllCompanies() {
        return this.prisma.company.findMany({
            include: {
                _count: {
                    select: {
                        users: true,
                    },
                },
            },
        });
    }
    async deactivateCompany(id) {
        return this.prisma.company.update({
            where: { id },
            data: { isActive: false },
        });
    }
    async resendInvite(id, email) {
        const company = await this.prisma.company.findFirst({ where: { id } });
        if (!company)
            throw new common_1.NotFoundException('Компанія не знайдена');
        const inviteLink = `${process.env.FRONTEND_URL}/auth/register?token=${company.inviteToken}`;
        await this.mail.sendCompanyInvite(email, company.name, inviteLink);
        return { message: 'Invite відправлено!' };
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        mail_service_1.MailService])
], AdminService);
//# sourceMappingURL=admin.service.js.map