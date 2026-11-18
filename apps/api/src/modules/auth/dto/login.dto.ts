import { IsString, MaxLength } from 'class-validator';
import { EmailInput } from './email-input';

export class LoginDto {
  @EmailInput()
  email!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}
