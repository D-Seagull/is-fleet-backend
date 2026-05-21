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
exports.UpdateTripDto = exports.UpdateStopDto = exports.AssignManagerDto = exports.AssignTripDto = void 0;
const openapi = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
const class_transformer_1 = require("class-transformer");
class AssignTripDto {
    driverId;
    static _OPENAPI_METADATA_FACTORY() {
        return { driverId: { required: true, type: () => String } };
    }
}
exports.AssignTripDto = AssignTripDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AssignTripDto.prototype, "driverId", void 0);
class AssignManagerDto {
    managerId;
    static _OPENAPI_METADATA_FACTORY() {
        return { managerId: { required: true, type: () => String } };
    }
}
exports.AssignManagerDto = AssignManagerDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AssignManagerDto.prototype, "managerId", void 0);
class UpdateStopDto {
    type;
    order;
    address;
    ref;
    coords;
    static _OPENAPI_METADATA_FACTORY() {
        return { type: { required: true, type: () => Object }, order: { required: false, type: () => Number }, address: { required: false, type: () => String }, ref: { required: false, type: () => String }, coords: { required: false, type: () => String } };
    }
}
exports.UpdateStopDto = UpdateStopDto;
__decorate([
    (0, class_validator_1.IsEnum)(['LOADING', 'UNLOADING']),
    __metadata("design:type", String)
], UpdateStopDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdateStopDto.prototype, "order", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateStopDto.prototype, "address", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateStopDto.prototype, "ref", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateStopDto.prototype, "coords", void 0);
class UpdateTripDto {
    status;
    notes;
    orderNumber;
    stops;
    static _OPENAPI_METADATA_FACTORY() {
        return { status: { required: false, type: () => Object }, notes: { required: false, type: () => String }, orderNumber: { required: false, type: () => String }, stops: { required: false, type: () => [require("./update-trip.dto").UpdateStopDto] } };
    }
}
exports.UpdateTripDto = UpdateTripDto;
__decorate([
    (0, class_validator_1.IsEnum)(client_1.TripStatus),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateTripDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateTripDto.prototype, "notes", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateTripDto.prototype, "orderNumber", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => UpdateStopDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], UpdateTripDto.prototype, "stops", void 0);
//# sourceMappingURL=update-trip.dto.js.map