import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { DocumentType } from '../../../../generated/prisma/client';

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
}
