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
exports.CompaniesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const supabase_storage_service_1 = require("../supabase-storage/supabase-storage.service");
let CompaniesService = class CompaniesService {
    prisma;
    storage;
    constructor(prisma, storage) {
        this.prisma = prisma;
        this.storage = storage;
    }
    async getCompany(companyId) {
        const company = await this.prisma.company.findFirst({
            where: { id: companyId },
        });
        if (!company)
            throw new common_1.NotFoundException('Компанія не знайдена');
        return company;
    }
    async uploadLogo(companyId, file) {
        const company = await this.prisma.company.findFirst({
            where: { id: companyId },
        });
        if (company?.logoPublicId) {
            await this.storage.deleteFile(company.logoPublicId);
        }
        const { url, storagePath } = await this.storage.uploadWithUrl(file, 'logos');
        return this.prisma.company.update({
            where: { id: companyId },
            data: { logo: url, logoPublicId: storagePath },
        });
    }
    async updateLogo(companyId, file) {
        return this.uploadLogo(companyId, file);
    }
    async deleteLogo(companyId) {
        const company = await this.prisma.company.findFirst({
            where: { id: companyId },
        });
        if (company?.logoPublicId) {
            await this.storage.deleteFile(company.logoPublicId);
        }
        return this.prisma.company.update({
            where: { id: companyId },
            data: { logo: null, logoPublicId: null },
        });
    }
    async updateEmails(companyId, dto) {
        return this.prisma.company.update({
            where: { id: companyId },
            data: dto,
        });
    }
};
exports.CompaniesService = CompaniesService;
exports.CompaniesService = CompaniesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        supabase_storage_service_1.SupabaseStorageService])
], CompaniesService);
//# sourceMappingURL=companies.service.js.map