import { IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message:
      'Passwort muss mindestens 8 Zeichen, einen Gro\u00dfbuchstaben, eine Zahl und ein Sonderzeichen enthalten',
  })
  password!: string;
}
