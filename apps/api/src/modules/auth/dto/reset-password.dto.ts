import { IsString, MaxLength } from 'class-validator';
import { StrongPassword } from '../password-policy';

export class ResetPasswordDto {
  @IsString()
  @MaxLength(128)
  token!: string;

  @StrongPassword()
  password!: string;
}
