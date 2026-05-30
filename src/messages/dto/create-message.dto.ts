import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  tripId: string;

  @IsString()
  content: string;

  @IsBoolean()
  @IsOptional()
  translate?: boolean;

  @IsString()
  @IsOptional()
  replyToId?: string | null;

  @IsString()
  @IsOptional()
  replyToDocumentId?: string | null;

  // Client-generated id for an optimistic placeholder bubble. Echoed back in
  // the `newMessage` emit so the sender can swap the temp message for the
  // real one without waiting for a refetch.
  @IsString()
  @IsOptional()
  tempId?: string;
}
