import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Translate } from '@google-cloud/translate/build/src/v2';

@Injectable()
export class TranslationService {
  private translate: Translate;

  constructor(private config: ConfigService) {
    this.translate = new Translate({
      key: config.get('GOOGLE_TRANSLATE_API_KEY'),
    });
  }

  async translateText(text: string, targetLanguage: string): Promise<string> {
    const [translation] = await this.translate.translate(text, targetLanguage);
    return translation;
  }

  getLanguageCode(language: string): string {
    const codes: Record<string, string> = {
      UK: 'uk',
      EN: 'en',
      PL: 'pl',
      LT: 'lt',
      UZ: 'uz',
      KZ: 'kk',
      HI: 'hi',
    };
    return codes[language] || 'en';
  }
}
