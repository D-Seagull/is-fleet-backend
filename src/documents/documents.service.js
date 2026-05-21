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
exports.DocumentsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const supabase_storage_service_1 = require("../supabase-storage/supabase-storage.service");
const messages_gateway_1 = require("../messages/messages.gateway");
let DocumentsService = class DocumentsService {
    prisma;
    storage;
    gateway;
    constructor(prisma, storage, gateway) {
        this.prisma = prisma;
        this.storage = storage;
        this.gateway = gateway;
    }
    async uploadMany(tripId, uploadedBy, files) {
        if (!files || files.length === 0)
            throw new Error('No files provided');
        const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
        if (!trip)
            throw new common_1.NotFoundException('Рейс не знайдений');
        const created = await Promise.all(files.map(async (file) => {
            const isImage = file.mimetype.startsWith('image/');
            const fileType = isImage ? 'PHOTO' : 'DOCUMENT';
            const { storagePath } = await this.storage.uploadFile(file);
            const doc = await this.prisma.tripDocument.create({
                data: {
                    tripId,
                    fileUrl: storagePath,
                    publicId: storagePath,
                    fileName: file.originalname,
                    uploadedBy,
                    fileType,
                },
                include: {
                    uploader: { select: { id: true, name: true, role: true } },
                    trip: {
                        select: {
                            id: true,
                            title: true,
                            orderNumber: true,
                            truck: { select: { id: true, plate: true } },
                        },
                    },
                },
            });
            const signedUrl = await this.storage.getSignedUrl(storagePath, 3600);
            return { ...doc, signedUrl };
        }));
        for (const doc of created) {
            this.gateway.emitNewDocument(tripId, doc);
        }
        return created;
    }
    async remove(id, userId, userRole) {
        const document = await this.prisma.tripDocument.findUnique({
            where: { id },
        });
        if (!document)
            throw new common_1.NotFoundException('Документ не знайдений');
        const isManager = ['ADMIN', 'TEAMLEAD', 'MANAGER'].includes(userRole);
        if (!isManager && document.uploadedBy !== userId) {
            throw new common_1.ForbiddenException('Ви не можете видалити цей документ');
        }
        if (document.fileUrl) {
            await this.storage.deleteFile(document.fileUrl);
        }
        await this.prisma.tripDocument.delete({ where: { id } });
        this.gateway.emitDocumentDeleted(document.tripId, document.id);
        return { message: `Документ ${document.fileName} видалений` };
    }
    async view(id) {
        const doc = await this.prisma.tripDocument.findUnique({ where: { id } });
        if (!doc)
            throw new common_1.NotFoundException('Документ не знайдений');
        const url = await this.storage.getSignedUrl(doc.fileUrl, 3600);
        return { url };
    }
    async download(id) {
        const doc = await this.prisma.tripDocument.findUnique({ where: { id } });
        if (!doc)
            throw new common_1.NotFoundException('Документ не знайдений');
        const url = await this.storage.getSignedUrl(doc.fileUrl, 3600, doc.fileName);
        return { url };
    }
    async withSignedUrl(doc) {
        const signedUrl = await this.storage.getSignedUrl(doc.fileUrl, 3600);
        return { ...doc, signedUrl };
    }
    async findByTrip(tripId) {
        const docs = await this.prisma.tripDocument.findMany({
            where: { tripId },
            include: { uploader: { select: { id: true, name: true, role: true } } },
            orderBy: { createdAt: 'desc' },
        });
        return Promise.all(docs.map((d) => this.withSignedUrl(d)));
    }
    async findByTruck(truckId) {
        const docs = await this.prisma.tripDocument.findMany({
            where: { trip: { truckId } },
            include: {
                uploader: { select: { id: true, name: true, role: true } },
                trip: { select: { id: true, title: true, orderNumber: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        return Promise.all(docs.map((d) => this.withSignedUrl(d)));
    }
    async findByCompany(companyId) {
        const docs = await this.prisma.tripDocument.findMany({
            where: { trip: { companyId } },
            include: {
                uploader: { select: { id: true, name: true, role: true } },
                trip: {
                    select: {
                        id: true,
                        title: true,
                        orderNumber: true,
                        truck: { select: { id: true, plate: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        return Promise.all(docs.map((d) => this.withSignedUrl(d)));
    }
};
exports.DocumentsService = DocumentsService;
exports.DocumentsService = DocumentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        supabase_storage_service_1.SupabaseStorageService,
        messages_gateway_1.MessagesGateway])
], DocumentsService);
//# sourceMappingURL=documents.service.js.map