import { IsString, IsEnum } from 'class-validator';
import { GroupType } from '@prisma/client';

export class CreateGroupDto {
  @IsString()
  name: string;

  @IsEnum(GroupType as object)
  type: GroupType;
}
