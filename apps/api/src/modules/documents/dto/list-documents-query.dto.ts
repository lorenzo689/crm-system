import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { DocumentType } from '../../../../generated/prisma/client';
import type { DocumentScope } from '../documents.repository';

export class ListDocumentsQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @IsOptional()
  @IsIn(['all', 'global', 'customer', 'project'])
  scope?: DocumentScope;

  @IsOptional()
  @IsIn(['true', 'false'])
  archived?: string;
}
