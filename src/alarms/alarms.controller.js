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
exports.AlarmsController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const alarms_service_1 = require("./alarms.service");
const create_alarm_dto_1 = require("./dto/create-alarm.dto");
const update_alarm_dto_1 = require("./dto/update-alarm.dto");
const jwt_guard_1 = require("../auth/guards/jwt.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const get_user_decorator_1 = require("../auth/decorators/get-user.decorator");
let AlarmsController = class AlarmsController {
    alarmsService;
    constructor(alarmsService) {
        this.alarmsService = alarmsService;
    }
    create(userId, role, companyId, dto) {
        return this.alarmsService.create(userId, role, companyId, dto);
    }
    findMy(userId) {
        return this.alarmsService.findMy(userId);
    }
    findCreated(userId) {
        return this.alarmsService.findCreated(userId);
    }
    findByTrip(tripId, userId, role, companyId) {
        return this.alarmsService.findByTrip(tripId, {
            id: userId,
            role,
            companyId,
        });
    }
    findByTruck(truckId, userId, role, companyId) {
        return this.alarmsService.findByTruck(truckId, {
            id: userId,
            role,
            companyId,
        });
    }
    update(id, userId, dto) {
        return this.alarmsService.update(id, userId, dto);
    }
    remove(id, userId) {
        return this.alarmsService.remove(id, userId);
    }
};
exports.AlarmsController = AlarmsController;
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Post)(),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('role')),
    __param(2, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, create_alarm_dto_1.CreateAlarmDto]),
    __metadata("design:returntype", void 0)
], AlarmsController.prototype, "create", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Get)('my'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AlarmsController.prototype, "findMy", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Get)('created'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AlarmsController.prototype, "findCreated", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Get)('trip/:tripId'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, get_user_decorator_1.GetUser)('id')),
    __param(2, (0, get_user_decorator_1.GetUser)('role')),
    __param(3, (0, get_user_decorator_1.GetUser)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", void 0)
], AlarmsController.prototype, "findByTrip", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Get)('truck/:truckId'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, common_1.Param)('truckId')),
    __param(1, (0, get_user_decorator_1.GetUser)('id')),
    __param(2, (0, get_user_decorator_1.GetUser)('role')),
    __param(3, (0, get_user_decorator_1.GetUser)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", void 0)
], AlarmsController.prototype, "findByTruck", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Patch)(':id'),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_alarm_dto_1.UpdateAlarmDto]),
    __metadata("design:returntype", void 0)
], AlarmsController.prototype, "update", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Delete)(':id'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AlarmsController.prototype, "remove", null);
exports.AlarmsController = AlarmsController = __decorate([
    (0, swagger_1.ApiTags)('alarms'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('alarms'),
    __metadata("design:paramtypes", [alarms_service_1.AlarmsService])
], AlarmsController);
//# sourceMappingURL=alarms.controller.js.map