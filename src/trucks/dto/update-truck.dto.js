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
exports.UpdateTruckDto = void 0;
const openapi = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
const class_validator_2 = require("class-validator");
class UpdateTruckDto {
    plate;
    status;
    currentDriverId;
    managerId;
    static _OPENAPI_METADATA_FACTORY() {
        return { plate: { required: false, type: () => String }, status: { required: false, type: () => Object }, currentDriverId: { required: false, type: () => String, nullable: true }, managerId: { required: false, type: () => String, nullable: true } };
    }
}
exports.UpdateTruckDto = UpdateTruckDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateTruckDto.prototype, "plate", void 0);
__decorate([
    (0, class_validator_2.IsEnum)(client_1.TruckStatus),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateTruckDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], UpdateTruckDto.prototype, "currentDriverId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], UpdateTruckDto.prototype, "managerId", void 0);
//# sourceMappingURL=update-truck.dto.js.map