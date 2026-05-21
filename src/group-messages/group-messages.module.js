"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupMessagesModule = void 0;
const common_1 = require("@nestjs/common");
const group_messages_service_1 = require("./group-messages.service");
const group_messages_controller_1 = require("./group-messages.controller");
const prisma_module_1 = require("../prisma/prisma.module");
let GroupMessagesModule = class GroupMessagesModule {
};
exports.GroupMessagesModule = GroupMessagesModule;
exports.GroupMessagesModule = GroupMessagesModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule],
        controllers: [group_messages_controller_1.GroupMessagesController],
        providers: [group_messages_service_1.GroupMessagesService],
        exports: [group_messages_service_1.GroupMessagesService],
    })
], GroupMessagesModule);
//# sourceMappingURL=group-messages.module.js.map