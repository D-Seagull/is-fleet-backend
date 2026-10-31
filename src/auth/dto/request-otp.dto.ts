import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  // E.164-ish: optional plus, 8–16 digits.
  @Matches(/^\+?\d{8,16}$/, {
    message: 'errors.phoneFormat',
  })
  phone: string;

  // sms (default) | email | whatsapp | telegram | manager. Deliberately not
  // an enum check: an unknown channel gets the same neutral ok, not a 400.
  @IsOptional()
  @IsString()
  @MaxLength(16)
  channel?: string;
}
