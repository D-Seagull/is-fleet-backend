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
exports.SetTimezoneDto = void 0;
const openapi = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class SetTimezoneDto {
    timezone;
    static _OPENAPI_METADATA_FACTORY() {
        return { timezone: { required: true, type: () => String, maxLength: 80, pattern: "^[A-Za-z]+(?:\\/[A-Za-z0-9_+\\-]+){0,2}$" } };
    }
}
exports.SetTimezoneDto = SetTimezoneDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    (0, class_validator_1.Matches)(/^[A-Za-z]+(?:\/[A-Za-z0-9_+\-]+){0,2}$/, {
        message: 'timezone must be a valid IANA name',
    }),
    __metadata("design:type", String)
], SetTimezoneDto.prototype, "timezone", void 0);
//# sourceMappingURL=timezone.dto.js.map