import { IsString, Matches } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  // E.164-ish: optional plus, 8–16 digits.
  @Matches(/^\+?\d{8,16}$/, {
    message: 'Phone must be in international format, e.g. +380501234567',
  })
  phone: string;
}
