import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Pagination params shared by DM and group chat history endpoints.
 * `take` — page size (1..100, default 50). `before` — ISO date cursor;
 * returns messages strictly older than this timestamp.
 */
export class GetChatMessagesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @IsOptional()
  @IsDateString()
  before?: string;
}
