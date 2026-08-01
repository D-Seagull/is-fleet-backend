import { IsString, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+?\d{8,16}$/, {
    message: 'errors.phoneFormat',
  })
  phone: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'Code must be 6 digits' })
  code: string;
}
