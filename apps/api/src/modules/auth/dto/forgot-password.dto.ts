import { EmailInput } from './email-input';

export class ForgotPasswordDto {
  @EmailInput()
  email!: string;
}
