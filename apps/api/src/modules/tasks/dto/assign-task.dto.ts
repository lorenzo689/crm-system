import { IsEnum, IsUUID } from 'class-validator';
import { TaskAssignmentRole } from '../../../../generated/prisma/client';

export class AssignTaskDto {
  @IsUUID()
  userId!: string;

  @IsEnum(TaskAssignmentRole)
  role!: TaskAssignmentRole;
}
