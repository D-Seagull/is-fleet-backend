import { IsString, Matches } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  // E.164-ish: optional plus, 8–16 digits.
  @Matches(/^\+?\d{8,16}$/, {
    message: 'errors.phoneFormat',
  })
  phone: string;
}
