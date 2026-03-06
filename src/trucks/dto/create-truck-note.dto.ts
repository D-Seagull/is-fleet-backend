import { IsString } from 'class-validator';

export class CreateTruckNoteDto {
  @IsString()
  content: string;
}
