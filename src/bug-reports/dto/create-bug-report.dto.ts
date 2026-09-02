import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Fields the clients POST when filing a bug. Everything here is optional — a
 * report is valid with just a screenshot and no words (the service rejects the
 * fully-empty case). The rest is auto-captured context (which app/version,
 * platform, the screen they were on, socket liveness). Screenshots arrive as
 * multipart files under the `screenshots` field, not here. Multipart sends
 * every field as a string, which lines up with these types under the global
 * `transform: true` ValidationPipe.
 */
export class CreateBugReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  appName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  route?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  socketState?: string;
}
