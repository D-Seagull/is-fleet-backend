import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetTripMessagesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  // Cursor: return messages strictly older than this createdAt. ISO 8601.
  @IsOptional()
  @IsDateString()
  before?: string;
}
