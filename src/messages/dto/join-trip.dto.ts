import { IsString } from 'class-validator';

export class JoinTripDto {
  @IsString()
  tripId: string;
}
