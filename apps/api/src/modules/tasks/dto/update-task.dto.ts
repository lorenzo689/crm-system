import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { CreateTaskDto } from './create-task.dto';

export class UpdateTaskDto extends PartialType(
  OmitType(CreateTaskDto, ['projectId', 'startAt', 'dueAt'] as const),
) {
  /** UUID assigns or changes the project, null removes it, omitted keeps it. */
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  /** Date sets, null clears, omitted keeps it. */
  @IsOptional()
  @IsDateString()
  startAt?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}
