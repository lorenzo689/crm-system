import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ALLOWED_VAT_RATES_BP = [0, 700, 1900];

export class CreateArticleDto {
  @IsString()
  @MaxLength(50)
  articleNumber!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  unitPriceCents!: number;

  @IsOptional()
  @IsIn(ALLOWED_VAT_RATES_BP)
  vatRateBp?: number;

  @IsOptional()
  @IsBoolean()
  trackStock?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  stockQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  minStock?: number;

  @IsOptional()
  @IsBoolean()
  isRentable?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  rentalStock?: number;

  /** Daily rental price, net, in cents. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  rentalPriceCents?: number;
}
