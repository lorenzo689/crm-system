import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class DownloadUrlQueryDto {
  @IsOptional()
  @IsIn(['inline', 'attachment'])
  disposition?: 'inline' | 'attachment';

  /** Id of a specific version; defaults to the current version. */
  @IsOptional()
  @IsUUID()
  version?: string;
}
