import { Type } from 'class-transformer';
import {
  IsEmail,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  SalesDocumentStatus,
  SalesDocumentType,
} from '../../../../generated/prisma/enums';
import { ALLOWED_VAT_RATES_BP } from '../../articles/dto/create-article.dto';

export class SalesDocumentItemDto {
  @IsOptional()
  @IsUUID()
  articleId?: string;

  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1_000_000)
  quantity!: number;

  @IsString()
  @MaxLength(20)
  unit!: string;

  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  unitPriceCents!: number;

  @IsIn(ALLOWED_VAT_RATES_BP)
  vatRateBp!: number;
}

export class CreateSalesDocumentDto {
  @IsEnum(SalesDocumentType)
  type!: SalesDocumentType;

  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsDateString()
  issueDate!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  headerText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  footerText?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SalesDocumentItemDto)
  items!: SalesDocumentItemDto[];
}

export class UpdateSalesDocumentDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  /** Send null to detach the project. */
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  headerText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  footerText?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SalesDocumentItemDto)
  items?: SalesDocumentItemDto[];
}

export class ChangeStatusDto {
  @IsEnum(SalesDocumentStatus)
  status!: SalesDocumentStatus;
}

export class ListSalesDocumentsQueryDto {
  @IsOptional()
  @IsEnum(SalesDocumentType)
  type?: SalesDocumentType;

  @IsOptional()
  @IsEnum(SalesDocumentStatus)
  status?: SalesDocumentStatus;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}

export class CreatePaymentDto {
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amountCents!: number;

  @IsDateString()
  paidAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SendSalesDocumentDto {
  @IsEmail()
  @MaxLength(254)
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;
}

export class CreditNoteItemDto {
  @IsUUID()
  itemId!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1_000_000)
  quantity!: number;
}

export class CreateCreditNoteDto {
  /** Omit to credit the whole invoice. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreditNoteItemDto)
  items?: CreditNoteItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
