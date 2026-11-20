import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateCompanyProfileDto {
  @IsString()
  @MaxLength(200)
  legalName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  website?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  vatId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  taxNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  iban?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  bic?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  defaultPaymentTermDays?: number;

  /** Net hourly rate in cents, used when billing logged time. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  defaultHourlyRateCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  invoiceFooter?: string | null;
}
