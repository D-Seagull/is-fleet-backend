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
exports.AdvanceRequestsController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const advance_requests_service_1 = require("./advance-requests.service");
const create_advance_request_dto_1 = require("./dto/create-advance-request.dto");
const jwt_guard_1 = require("../auth/guards/jwt.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const get_user_decorator_1 = require("../auth/decorators/get-user.decorator");
const swagger_1 = require("@nestjs/swagger");
let AdvanceRequestsController = class AdvanceRequestsController {
    advanceRequestsService;
    constructor(advanceRequestsService) {
        this.advanceRequestsService = advanceRequestsService;
    }
    create(driverId, companyId, dto) {
        return this.advanceRequestsService.create(driverId, companyId, dto);
    }
    findMyRequests(userId, role) {
        return this.advanceRequestsService.findMyRequests(userId, role);
    }
};
exports.AdvanceRequestsController = AdvanceRequestsController;
__decorate([
    (0, roles_decorator_1.Roles)('DRIVER'),
    (0, common_1.Post)(),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('companyId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, create_advance_request_dto_1.CreateAdvanceRequestDto]),
    __metadata("design:returntype", void 0)
], AdvanceRequestsController.prototype, "create", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'TEAMLEAD', 'MANAGER', 'DRIVER'),
    (0, common_1.Get)(),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('role')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AdvanceRequestsController.prototype, "findMyRequests", null);
exports.AdvanceRequestsController = AdvanceRequestsController = __decorate([
    (0, swagger_1.ApiTags)('advance-requests'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('advance-requests'),
    __metadata("design:paramtypes", [advance_requests_service_1.AdvanceRequestsService])
], AdvanceRequestsController);
//# sourceMappingURL=advance-requests.controller.js.map