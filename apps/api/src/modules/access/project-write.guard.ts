import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUser } from '../auth/strategies/jwt.strategies';
import { AccessService, type ProjectScopedEntity } from './access.service';

export const PROJECT_WRITE_KEY = 'projectWrite';

export interface ProjectWriteOptions {
  /**
   * Existing record addressed by the route. Its project is read from the
   * database, never taken from the client.
   */
  entity?: ProjectScopedEntity;
  /** Route parameter holding the record id (default `id`). */
  param?: string;
  /**
   * Body field naming a (new) project, e.g. on create or when an update moves
   * a record to another project. Combined with `entity`, both projects are
   * checked.
   */
  bodyField?: string;
}

/**
 * Marks a mutation as project-scoped: a user with project role VIEWER on the
 * affected project gets 403. Requires ProjectWriteGuard after JwtAuthGuard.
 */
export const ProjectWrite = (options: ProjectWriteOptions) =>
  SetMetadata(PROJECT_WRITE_KEY, options);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(value: unknown): string | undefined {
  return typeof value === 'string' && UUID_PATTERN.test(value)
    ? value
    : undefined;
}

@Injectable()
export class ProjectWriteGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<ProjectWriteOptions | undefined>(
      PROJECT_WRITE_KEY,
      context.getHandler(),
    );
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }

    const projectIds = new Set<string>();
    if (options.entity) {
      // Malformed ids are left to ParseUUIDPipe (400); unknown ones to the service (404).
      const id = asUuid(request.params[options.param ?? 'id']);
      if (id) {
        const projectId = await this.access.projectIdOf(options.entity, id);
        if (projectId) projectIds.add(projectId);
      }
    }
    if (options.bodyField) {
      // Runs before validation, so only a well-formed UUID string is used.
      const body = request.body as Record<string, unknown> | undefined;
      const projectId = asUuid(body?.[options.bodyField]);
      if (projectId) projectIds.add(projectId);
    }

    for (const projectId of projectIds) {
      await this.access.assertProjectWritable(projectId, user.sub);
    }
    return true;
  }
}
