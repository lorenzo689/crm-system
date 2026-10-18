import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  @Matches(/@bissinger-lights\.de$/i, {
    message: 'Nur Bissinger-Lights-E-Mail-Adressen sind erlaubt',
  })
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message:
      'Passwort muss mindestens 8 Zeichen, einen Gro\u00dfbuchstaben, eine Zahl und ein Sonderzeichen enthalten',
  })
  password!: string;

  @IsString()
  @MaxLength(200)
  registrationCode!: string;
}
