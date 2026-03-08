import { IsString, IsEnum, IsOptional } from 'class-validator';
import { AnnouncementTarget } from '@prisma/client';

export class CreateAnnouncementDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsEnum(AnnouncementTarget as object)
  @IsOptional()
  target?: AnnouncementTarget;

  @IsString()
  @IsOptional()
  groupId?: string;
}
