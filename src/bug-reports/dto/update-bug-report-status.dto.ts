import { IsEnum } from 'class-validator';
import { BugStatus } from '@prisma/client';

export class UpdateBugReportStatusDto {
  @IsEnum(BugStatus)
  status: BugStatus;
}
