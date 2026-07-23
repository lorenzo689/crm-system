import { IsEnum, IsUUID } from 'class-validator';
import { ProjectMemberRole } from '../../../../generated/prisma/client';

export class AddProjectMemberDto {
  @IsUUID()
  userId!: string;

  @IsEnum(ProjectMemberRole)
  role!: ProjectMemberRole;
}
