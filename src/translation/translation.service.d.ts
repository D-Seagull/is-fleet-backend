import { ConfigService } from '@nestjs/config';
export declare class TranslationService {
    private config;
    private translate;
    constructor(config: ConfigService);
    translateText(text: string, targetLanguage: string): Promise<string>;
    getLanguageCode(language: string): string;
}
