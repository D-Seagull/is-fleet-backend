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
exports.CreateAlarmDto = void 0;
const openapi = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class CreateAlarmDto {
    targetUserId;
    title;
    note;
    time;
    tripId;
    recurrence;
    static _OPENAPI_METADATA_FACTORY() {
        return { targetUserId: { required: true, type: () => String }, title: { required: true, type: () => String, maxLength: 120 }, note: { required: false, type: () => String, maxLength: 500 }, time: { required: true, type: () => String }, tripId: { required: false, type: () => String }, recurrence: { required: false, type: () => Object } };
    }
}
exports.CreateAlarmDto = CreateAlarmDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateAlarmDto.prototype, "targetUserId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateAlarmDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CreateAlarmDto.prototype, "note", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateAlarmDto.prototype, "time", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateAlarmDto.prototype, "tripId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(client_1.AlarmRecurrence),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateAlarmDto.prototype, "recurrence", void 0);
//# sourceMappingURL=create-alarm.dto.js.map