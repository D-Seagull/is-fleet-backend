import { IsBoolean, IsOptional, IsString } from 'class-validator';

/** `POST /auth/refresh` and `/auth/logout` body (mobile sends the token here). */
export class RefreshBodyDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
