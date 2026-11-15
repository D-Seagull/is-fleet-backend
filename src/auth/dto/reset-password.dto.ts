import { IsString, MinLength } from 'class-validator';
import { PASSWORD_MIN_LENGTH } from '../password-policy';

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  password: string;
}
