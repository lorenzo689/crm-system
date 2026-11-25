import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { ProjectWriteGuard } from './project-write.guard';

@Global()
@Module({
  providers: [AccessService, ProjectWriteGuard],
  exports: [AccessService, ProjectWriteGuard],
})
export class AccessModule {}
