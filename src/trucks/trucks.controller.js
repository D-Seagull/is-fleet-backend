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
exports.TrucksController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const trucks_service_1 = require("./trucks.service");
const create_truck_dto_1 = require("./dto/create-truck.dto");
const update_truck_dto_1 = require("./dto/update-truck.dto");
const jwt_guard_1 = require("../auth/guards/jwt.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const get_user_decorator_1 = require("../auth/decorators/get-user.decorator");
const create_truck_note_dto_1 = require("./dto/create-truck-note.dto");
const swagger_1 = require("@nestjs/swagger");
let TrucksController = class TrucksController {
    trucksService;
    constructor(trucksService) {
        this.trucksService = trucksService;
    }
    create(companyId, dto) {
        return this.trucksService.create(companyId, dto);
    }
    findAll(companyId) {
        return this.trucksService.findAll(companyId);
    }
    findDriverTruck(userId) {
        return this.trucksService.findDriverTruck(userId);
    }
    findMy(userId, companyId) {
        return this.trucksService.findMyTrucks(userId, companyId);
    }
    findDeactivated(companyId) {
        return this.trucksService.findDeactivated(companyId);
    }
    activate(id, companyId) {
        return this.trucksService.activate(id, companyId);
    }
    findOne(id, companyId) {
        return this.trucksService.findOne(id, companyId);
    }
    update(id, companyId, userId, dto) {
        return this.trucksService.update(id, companyId, dto, userId);
    }
    remove(id, companyId) {
        return this.trucksService.remove(id, companyId);
    }
    createNote(truckId, companyId, userId, dto) {
        return this.trucksService.createNote(truckId, companyId, userId, dto);
    }
    getNotes(truckId) {
        return this.trucksService.getNotes(truckId);
    }
    removeNote(id, userId) {
        return this.trucksService.removeNote(id, userId);
    }
};
exports.TrucksController = TrucksController;
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Post)(),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_truck_dto_1.CreateTruckDto]),
    __metadata("design:returntype", void 0)
], TrucksController.prototype, "create", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Get)(),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, get_user_decorator_1.GetUser)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TrucksController.prototype, "findAll", null);
__decorate([
    (0, roles_decorator_1.Roles)('DRIVER'),
    (0, common_1.Get)('driver-truck'),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TrucksController.prototype, "findDriverTruck", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Get)('my'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TrucksController.prototype, "findMy", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD'),
    (0, common_1.Get)('deactivated'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, get_user_decorator_1.GetUser)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TrucksController.prototype, "findDeactivated", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD'),
    (0, common_1.Patch)(':id/activate'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TrucksController.prototype, "activate", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Get)(':id'),
    openapi.ApiResponse({ status: 200, type: Object }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TrucksController.prototype, "findOne", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Patch)(':id'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(2, (0, get_user_decorator_1.GetUser)('id')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, update_truck_dto_1.UpdateTruckDto]),
    __metadata("design:returntype", void 0)
], TrucksController.prototype, "update", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER'),
    (0, common_1.Delete)(':id'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TrucksController.prototype, "remove", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Post)(':id/notes'),
    openapi.ApiResponse({ status: 201, type: Object }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(2, (0, get_user_decorator_1.GetUser)('id')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, create_truck_note_dto_1.CreateTruckNoteDto]),
    __metadata("design:returntype", void 0)
], TrucksController.prototype, "createNote", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Get)(':id/notes'),
    openapi.ApiResponse({ status: 200, type: [Object] }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TrucksController.prototype, "getNotes", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Delete)('notes/:id'),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TrucksController.prototype, "removeNote", null);
exports.TrucksController = TrucksController = __decorate([
    (0, swagger_1.ApiTags)('trucks'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('trucks'),
    __metadata("design:paramtypes", [trucks_service_1.TrucksService])
], TrucksController);
//# sourceMappingURL=trucks.controller.js.map