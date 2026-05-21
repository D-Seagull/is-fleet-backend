"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const auth_module_1 = require("./auth/auth.module");
const users_module_1 = require("./users/users.module");
const prisma_module_1 = require("./prisma/prisma.module");
const trucks_module_1 = require("./trucks/trucks.module");
const trips_module_1 = require("./trips/trips.module");
const documents_module_1 = require("./documents/documents.module");
const messages_module_1 = require("./messages/messages.module");
const translation_service_1 = require("./translation/translation.service");
const translation_module_1 = require("./translation/translation.module");
const schedule_1 = require("@nestjs/schedule");
const alarms_module_1 = require("./alarms/alarms.module");
const announcements_module_1 = require("./announcements/announcements.module");
const groups_module_1 = require("./groups/groups.module");
const advance_requests_module_1 = require("./advance-requests/advance-requests.module");
const mail_module_1 = require("./mail/mail.module");
const companies_module_1 = require("./companies/companies.module");
const admin_module_1 = require("./admin/admin.module");
const direct_messages_module_1 = require("./direct-messages/direct-messages.module");
const direct_messages_service_1 = require("./direct-messages/direct-messages.service");
const group_messages_module_1 = require("./group-messages/group-messages.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
            }),
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            prisma_module_1.PrismaModule,
            trucks_module_1.TrucksModule,
            trips_module_1.TripsModule,
            documents_module_1.DocumentsModule,
            messages_module_1.MessagesModule,
            translation_module_1.TranslationModule,
            schedule_1.ScheduleModule.forRoot(),
            alarms_module_1.AlarmsModule,
            announcements_module_1.AnnouncementsModule,
            groups_module_1.GroupsModule,
            advance_requests_module_1.AdvanceRequestsModule,
            mail_module_1.MailModule,
            companies_module_1.CompaniesModule,
            admin_module_1.AdminModule,
            direct_messages_module_1.DirectMessagesModule,
            group_messages_module_1.GroupMessagesModule,
        ],
        controllers: [],
        providers: [translation_service_1.TranslationService, direct_messages_service_1.DirectMessagesService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map