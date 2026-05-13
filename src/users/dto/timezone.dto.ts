import { IsString, Matches, MaxLength } from 'class-validator';

export class SetTimezoneDto {
  /** IANA timezone — e.g. "Europe/Warsaw", "America/New_York". */
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z]+(?:\/[A-Za-z0-9_+\-]+){0,2}$/, {
    message: 'timezone must be a valid IANA name',
  })
  timezone: string;
}
