import { IsString } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  tripId: string;

  @IsString()
  content: string;
}
