import { IsString, IsEmail } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string; // email замовника — куди відправити invite
}
