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
exports.UsersController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const users_service_1 = require("./users.service");
const create_manager_dto_1 = require("./dto/create-manager.dto");
const create_driver_dto_1 = require("./dto/create-driver.dto");
const update_driver_dto_1 = require("./dto/update-driver.dto");
const push_token_dto_1 = require("./dto/push-token.dto");
const timezone_dto_1 = require("./dto/timezone.dto");
const jwt_guard_1 = require("../auth/guards/jwt.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const get_user_decorator_1 = require("../auth/decorators/get-user.decorator");
const swagger_1 = require("@nestjs/swagger");
let UsersController = class UsersController {
    usersService;
    constructor(usersService) {
        this.usersService = usersService;
    }
    createManager(companyId, creatorId, dto) {
        return this.usersService.createManager(companyId, creatorId, dto);
    }
    createDriver(companyId, creatorId, dto) {
        return this.usersService.createDriver(companyId, creatorId, dto);
    }
    getUsers(companyId) {
        return this.usersService.getCompanyUsers(companyId);
    }
    getUserById(id) {
        return this.usersService.getUserById(id);
    }
    updateDriver(id, companyId, dto) {
        return this.usersService.updateDriver(id, companyId, dto);
    }
    activate(id, companyId) {
        return this.usersService.activate(id, companyId);
    }
    deactivate(id, companyId, role) {
        return this.usersService.deactivate(id, companyId, role);
    }
    upsertRating(driverId, ratedById, body) {
        return this.usersService.upsertRating(driverId, ratedById, body.score, body.comment, body.anonymous);
    }
    getDriverRatings(driverId) {
        return this.usersService.getDriverRatings(driverId);
    }
    upsertManagerRating(managerId, ratedById, companyId, body) {
        return this.usersService.upsertManagerRating(managerId, ratedById, companyId, body.score, body.comment, body.anonymous);
    }
    getManagerRatings(managerId) {
        return this.usersService.getManagerRatings(managerId);
    }
    uploadAvatar(userId, file) {
        return this.usersService.uploadAvatar(userId, file);
    }
    deleteAvatar(userId) {
        return this.usersService.deleteAvatar(userId);
    }
    registerPushToken(userId, dto) {
        return this.usersService.registerPushToken(userId, dto.token, dto.platform);
    }
    unregisterPushToken(userId, token) {
        return this.usersService.deletePushToken(userId, token);
    }
    setTimezone(userId, dto) {
        return this.usersService.setTimezone(userId, dto.timezone);
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD'),
    (0, common_1.Post)('manager'),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(1, (0, get_user_decorator_1.GetUser)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, create_manager_dto_1.CreateManagerDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "createManager", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'MANAGER', 'TEAMLEAD'),
    (0, common_1.Post)('driver'),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(1, (0, get_user_decorator_1.GetUser)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, create_driver_dto_1.CreateDriverDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "createDriver", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Get)(),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, get_user_decorator_1.GetUser)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "getUsers", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Get)(':id'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "getUserById", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Patch)(':id'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_driver_dto_1.UpdateDriverDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "updateDriver", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Patch)(':id/activate'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "activate", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Patch)(':id/deactivate'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(2, (0, get_user_decorator_1.GetUser)('role')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "deactivate", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Post)(':id/ratings'),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "upsertRating", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Get)(':id/ratings'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "getDriverRatings", null);
__decorate([
    (0, roles_decorator_1.Roles)('DRIVER'),
    (0, common_1.Post)(':id/manager-ratings'),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('id')),
    __param(2, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "upsertManagerRating", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Get)(':id/manager-ratings'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "getManagerRatings", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Post)('avatar'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "uploadAvatar", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Delete)('avatar'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "deleteAvatar", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Post)('me/push-token'),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, push_token_dto_1.RegisterPushTokenDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "registerPushToken", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Delete)('me/push-token/:token'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "unregisterPushToken", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Patch)('me/timezone'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, timezone_dto_1.SetTimezoneDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "setTimezone", null);
exports.UsersController = UsersController = __decorate([
    (0, swagger_1.ApiTags)('users'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('users'),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], UsersController);
//# sourceMappingURL=users.controller.js.map