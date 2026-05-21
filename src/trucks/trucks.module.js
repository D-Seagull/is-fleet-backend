"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrucksModule = void 0;
const common_1 = require("@nestjs/common");
const trucks_service_1 = require("./trucks.service");
const trucks_controller_1 = require("./trucks.controller");
const messages_module_1 = require("../messages/messages.module");
const push_module_1 = require("../push/push.module");
let TrucksModule = class TrucksModule {
};
exports.TrucksModule = TrucksModule;
exports.TrucksModule = TrucksModule = __decorate([
    (0, common_1.Module)({
        imports: [messages_module_1.MessagesModule, push_module_1.PushModule],
        controllers: [trucks_controller_1.TrucksController],
        providers: [trucks_service_1.TrucksService],
        exports: [trucks_service_1.TrucksService],
    })
], TrucksModule);
//# sourceMappingURL=trucks.module.js.map