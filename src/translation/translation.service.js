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
exports.TranslationService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const v2_1 = require("@google-cloud/translate/build/src/v2");
let TranslationService = class TranslationService {
    config;
    translate;
    constructor(config) {
        this.config = config;
        this.translate = new v2_1.Translate({
            key: config.get('GOOGLE_TRANSLATE_API_KEY'),
        });
    }
    async translateText(text, targetLanguage) {
        const [translation] = await this.translate.translate(text, targetLanguage);
        return translation;
    }
    getLanguageCode(language) {
        const codes = {
            UK: 'uk',
            EN: 'en',
            PL: 'pl',
            LT: 'lt',
            UZ: 'uz',
            KZ: 'kk',
            HI: 'hi',
            RU: 'ru',
        };
        return codes[language] || 'ru';
    }
};
exports.TranslationService = TranslationService;
exports.TranslationService = TranslationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], TranslationService);
//# sourceMappingURL=translation.service.js.map