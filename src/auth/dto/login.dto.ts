import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  /** "Remember me" — when false, the refresh cookie is session-only (dropped
   *  on browser close) instead of persisting for 30 days. Defaults to true. */
  @IsOptional()
  @IsBoolean()
  remember?: boolean;

  /** Native clients (is-manager / is-driver) can't rely on an httpOnly cookie,
   *  so when true the refresh token is returned in the JSON body instead of
   *  being moved into a Set-Cookie header. Web leaves this unset. */
  @IsOptional()
  @IsBoolean()
  mobile?: boolean;
}
