import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { DocumentType } from '../../../../generated/prisma/client';

function normalizeTags(value: unknown): unknown {
  if (!Array.isArray(value)) return value;

  return [
    ...new Set(
      (value as unknown[]).map((tag) =>
        typeof tag === 'string' ? tag.trim() : tag,
      ),
    ),
  ];
}

export class CreateDocumentDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @IsOptional()
  @Transform(({ value }) => normalizeTags(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}
