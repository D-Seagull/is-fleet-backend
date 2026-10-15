import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  token: string;

  @IsOptional()
  @IsIn(['ios', 'android', 'web'])
  platform?: 'ios' | 'android' | 'web';

  /** Android notification channels the app has created (e.g. "chat",
   *  "alarm"). Older app versions don't send it. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channels?: string[];
}
