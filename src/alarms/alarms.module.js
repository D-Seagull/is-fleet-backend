"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlarmsModule = void 0;
const common_1 = require("@nestjs/common");
const alarms_service_1 = require("./alarms.service");
const alarms_controller_1 = require("./alarms.controller");
const push_module_1 = require("../push/push.module");
const messages_module_1 = require("../messages/messages.module");
let AlarmsModule = class AlarmsModule {
};
exports.AlarmsModule = AlarmsModule;
exports.AlarmsModule = AlarmsModule = __decorate([
    (0, common_1.Module)({
        imports: [push_module_1.PushModule, messages_module_1.MessagesModule],
        providers: [alarms_service_1.AlarmsService],
        controllers: [alarms_controller_1.AlarmsController],
    })
], AlarmsModule);
//# sourceMappingURL=alarms.module.js.map