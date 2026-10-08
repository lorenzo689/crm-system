import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsUUID } from 'class-validator';
import { CreateTaskDto } from './create-task.dto';

export class UpdateTaskDto extends PartialType(
  OmitType(CreateTaskDto, ['projectId'] as const),
) {
  /** UUID assigns or changes the project, null removes it, omitted keeps it. */
  @IsOptional()
  @IsUUID()
  projectId?: string | null;
}
