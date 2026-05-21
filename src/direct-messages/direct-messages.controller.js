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
exports.DirectMessagesController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const direct_messages_service_1 = require("./direct-messages.service");
const jwt_guard_1 = require("../auth/guards/jwt.guard");
const get_user_decorator_1 = require("../auth/decorators/get-user.decorator");
const swagger_1 = require("@nestjs/swagger");
let DirectMessagesController = class DirectMessagesController {
    service;
    constructor(service) {
        this.service = service;
    }
    getConversations(userId) {
        return this.service.getConversations(userId);
    }
    getMessages(currentUserId, otherUserId) {
        return this.service.getMessages(currentUserId, otherUserId);
    }
    markAsRead(currentUserId, senderId) {
        return this.service.markAsRead(currentUserId, senderId);
    }
};
exports.DirectMessagesController = DirectMessagesController;
__decorate([
    (0, common_1.Get)('conversations'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DirectMessagesController.prototype, "getConversations", null);
__decorate([
    (0, common_1.Get)(':userId'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], DirectMessagesController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Post)(':userId/read'),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], DirectMessagesController.prototype, "markAsRead", null);
exports.DirectMessagesController = DirectMessagesController = __decorate([
    (0, swagger_1.ApiTags)('direct-messages'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard),
    (0, common_1.Controller)('direct-messages'),
    __metadata("design:paramtypes", [direct_messages_service_1.DirectMessagesService])
], DirectMessagesController);
//# sourceMappingURL=direct-messages.controller.js.map