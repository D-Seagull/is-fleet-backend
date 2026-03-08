import { IsString, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { AnnouncementTarget } from '@prisma/client';

export class CreateDraftDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsEnum(AnnouncementTarget as object)
  @IsOptional()
  target?: AnnouncementTarget;

  @IsBoolean()
  @IsOptional()
  isTemplate?: boolean;

  @IsString()
  @IsOptional()
  groupId?: string;
}
