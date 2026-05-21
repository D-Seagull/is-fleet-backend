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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagesController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const get_user_decorator_1 = require("../auth/decorators/get-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_guard_1 = require("../auth/guards/jwt.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const messages_gateway_1 = require("./messages.gateway");
const messages_service_1 = require("./messages.service");
let MessagesController = class MessagesController {
    messagesService;
    gateway;
    constructor(messagesService, gateway) {
        this.messagesService = messagesService;
        this.gateway = gateway;
    }
    getUnreadSummary(companyId, userId, role) {
        return this.messagesService.getUnreadSummary(companyId, userId, role);
    }
    getDriverUnreadSummary(userId) {
        return this.messagesService.getDriverUnreadSummary(userId);
    }
    async remove(id, userId, role) {
        const { tripId } = await this.messagesService.remove(id, userId, role);
        this.gateway.emitMessageDeleted(tripId, id);
        return { id };
    }
};
exports.MessagesController = MessagesController;
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Get)('unread'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(1, (0, get_user_decorator_1.GetUser)('id')),
    __param(2, (0, get_user_decorator_1.GetUser)('role')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], MessagesController.prototype, "getUnreadSummary", null);
__decorate([
    (0, roles_decorator_1.Roles)('DRIVER'),
    (0, common_1.Get)('unread/driver'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MessagesController.prototype, "getDriverUnreadSummary", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Delete)(':id'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('id')),
    __param(2, (0, get_user_decorator_1.GetUser)('role')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "remove", null);
exports.MessagesController = MessagesController = __decorate([
    (0, swagger_1.ApiTags)('messages'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('messages'),
    __metadata("design:paramtypes", [messages_service_1.MessagesService,
        messages_gateway_1.MessagesGateway])
], MessagesController);
//# sourceMappingURL=messages.controller.js.map