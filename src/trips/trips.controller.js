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
exports.TripsController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const trips_service_1 = require("./trips.service");
const create_trip_dto_1 = require("./dto/create-trip.dto");
const update_trip_dto_1 = require("./dto/update-trip.dto");
const jwt_guard_1 = require("../auth/guards/jwt.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const get_user_decorator_1 = require("../auth/decorators/get-user.decorator");
const swagger_1 = require("@nestjs/swagger");
let TripsController = class TripsController {
    tripsService;
    constructor(tripsService) {
        this.tripsService = tripsService;
    }
    create(companyId, managerId, dto) {
        return this.tripsService.create(companyId, managerId, dto);
    }
    findAll(companyId) {
        return this.tripsService.findAll(companyId);
    }
    broadcast(userId, companyId, content) {
        return this.tripsService.broadcastToMyTrucks(userId, companyId, content);
    }
    findByTruck(truckId, companyId) {
        return this.tripsService.findByTruck(truckId, companyId);
    }
    findMyTrips(driverId) {
        return this.tripsService.findMyTrips(driverId);
    }
    findMyActiveTrip(driverId) {
        return this.tripsService.findMyActiveTrip(driverId);
    }
    findOne(id, companyId) {
        return this.tripsService.findOne(id, companyId);
    }
    getMessages(id, companyId, userId, role) {
        return this.tripsService.getMessages(id, companyId, { id: userId, role });
    }
    updateInfo(id, companyId, dto) {
        return this.tripsService.updateInfo(id, companyId, dto);
    }
    assignDriver(id, companyId, userId, dto) {
        return this.tripsService.assignDriver(id, companyId, dto.driverId, userId);
    }
    assignManager(id, companyId, userId, dto) {
        return this.tripsService.assignManager(id, companyId, dto.managerId, userId);
    }
    getChatArchive(id, companyId, userId, role) {
        return this.tripsService.getChatArchive(id, companyId, { id: userId, role });
    }
    getSessionMessages(sessionId, userId, role) {
        return this.tripsService.getSessionMessages(sessionId, { id: userId, role });
    }
    updateStatus(id, companyId, dto) {
        return this.tripsService.updateStatus(id, companyId, dto);
    }
    driverUpdateStatus(id, driverId, dto) {
        return this.tripsService.driverUpdateStatus(id, driverId, dto);
    }
    async remove(id, companyId) {
        return this.tripsService.remove(id, companyId);
    }
};
exports.TripsController = TripsController;
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Post)(),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(1, (0, get_user_decorator_1.GetUser)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, create_trip_dto_1.CreateTripDto]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "create", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Get)(),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, get_user_decorator_1.GetUser)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "findAll", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Post)('broadcast'),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(2, (0, common_1.Body)('content')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "broadcast", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Get)('truck/:truckId'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, common_1.Param)('truckId')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "findByTruck", null);
__decorate([
    (0, roles_decorator_1.Roles)('DRIVER'),
    (0, common_1.Get)('my'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "findMyTrips", null);
__decorate([
    (0, roles_decorator_1.Roles)('DRIVER'),
    (0, common_1.Get)('my/active'),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "findMyActiveTrip", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Get)(':id'),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "findOne", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Get)(':id/messages'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(2, (0, get_user_decorator_1.GetUser)('id')),
    __param(3, (0, get_user_decorator_1.GetUser)('role')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "getMessages", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Patch)(':id/info'),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_trip_dto_1.UpdateTripDto]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "updateInfo", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Patch)(':id/assign'),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(2, (0, get_user_decorator_1.GetUser)('id')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, update_trip_dto_1.AssignTripDto]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "assignDriver", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD'),
    (0, common_1.Patch)(':id/manager'),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(2, (0, get_user_decorator_1.GetUser)('id')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, update_trip_dto_1.AssignManagerDto]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "assignManager", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Get)(':id/chat/archive'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(2, (0, get_user_decorator_1.GetUser)('id')),
    __param(3, (0, get_user_decorator_1.GetUser)('role')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "getChatArchive", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Get)(':id/chat/sessions/:sessionId/messages'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, get_user_decorator_1.GetUser)('id')),
    __param(2, (0, get_user_decorator_1.GetUser)('role')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "getSessionMessages", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Patch)(':id/status'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_trip_dto_1.UpdateTripDto]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "updateStatus", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'DRIVER'),
    (0, common_1.Patch)(':id/driver-status'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_trip_dto_1.UpdateTripDto]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "driverUpdateStatus", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD'),
    (0, common_1.Delete)(':id'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TripsController.prototype, "remove", null);
exports.TripsController = TripsController = __decorate([
    (0, swagger_1.ApiTags)('trips'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('trips'),
    __metadata("design:paramtypes", [trips_service_1.TripsService])
], TripsController);
//# sourceMappingURL=trips.controller.js.map