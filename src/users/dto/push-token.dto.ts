import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  token: string;

  @IsOptional()
  // `android-fcm`: the raw FCM token, registered next to the Expo one for
  // the FCM delivery experiment (FcmService).
  @IsIn(['ios', 'android', 'web', 'android-fcm'])
  platform?: 'ios' | 'android' | 'web' | 'android-fcm';

  /** Android notification channels the app has created (e.g. "chat",
   *  "alarm"). Older app versions don't send it. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channels?: string[];
}

/** EXPERIMENT: test push to my own phone (PushService.sendTest). */
export class PushTestDto {
  @IsIn(['expo', 'fcm'])
  via: 'expo' | 'fcm';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(300)
  delaySec?: number;
}
