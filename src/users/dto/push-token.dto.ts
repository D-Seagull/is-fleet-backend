import { IsIn, IsOptional, IsString } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  token: string;

  @IsOptional()
  @IsIn(['ios', 'android', 'web'])
  platform?: 'ios' | 'android' | 'web';
}
