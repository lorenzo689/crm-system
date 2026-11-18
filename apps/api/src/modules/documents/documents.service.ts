import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { STORAGE_SERVICE } from '../../common/storage/storage.interface';
import type { StorageService } from '../../common/storage/storage.interface';
import { AccessService } from '../access/access.service';
import { ActivitiesService } from '../activities/activities.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { assertFileSignature } from './file-signature';
import { TextExtractionService } from './text-extraction.service';
import {
  DocumentListFilters,
  DocumentsRepository,
} from './documents.repository';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/dwg',
  'image/vnd.dwg',
];

const DWG_MIME_TYPE = 'image/vnd.dwg';
const GENERIC_MIME_TYPES = ['', 'application/octet-stream'];

// Browsers usually send no usable MIME type for .dwg, so only that extension
// is accepted by name; every other type stays strictly MIME-based.
function resolveMimeType(file: { originalname: string; mimetype?: string }) {
  const mimeType = file.mimetype?.trim().toLowerCase() ?? '';
  if (
    GENERIC_MIME_TYPES.includes(mimeType) &&
    file.originalname.toLowerCase().endsWith('.dwg')
  ) {
    return DWG_MIME_TYPE;
  }
  return mimeType;
}

// Multer hands UTF-8 multipart file names over decoded as latin1 ("PrÃ¼fbericht").
// Re-decode only when that round-trips losslessly, so real latin1 names stay intact.
export function normalizeFileName(originalname: string): string {
  const decoded = Buffer.from(originalname, 'latin1').toString('utf8');
  const isLosslessUtf8 =
    !decoded.includes('�') &&
    Buffer.from(decoded, 'utf8').toString('latin1') === originalname;
  return isLosslessUtf8 ? decoded : originalname;
}

function resolveActivityContext(document: {
  customerId: string | null;
  projectId: string | null;
}) {
  if (document.projectId) return { projectId: document.projectId };
  if (document.customerId) return { customerId: document.customerId };
  return null;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly documentsRepository: DocumentsRepository,
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
    private readonly activitiesService: ActivitiesService,
    private readonly textExtractionService: TextExtractionService,
    private readonly access: AccessService,
  ) {}

  private async assertValidContext(
    organizationId: string,
    context: { customerId?: string; projectId?: string },
  ) {
    let customer: { id: string } | null = null;
    if (context.customerId) {
      customer = await this.prisma.customer.findFirst({
        where: { id: context.customerId, organizationId },
      });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
    }

    let project: { customerId: string } | null = null;
    if (context.projectId) {
      project = await this.prisma.project.findFirst({
        where: { id: context.projectId, organizationId },
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }
    }

    // Regel 3: falls beide gesetzt sind, muss das Projekt zu genau diesem Kunden gehoeren
    if (customer && project && project.customerId !== customer.id) {
      throw new BadRequestException(
        'Project does not belong to the specified customer',
      );
    }
  }

  async findAll(organizationId: string, filters: DocumentListFilters) {
    return this.documentsRepository.findAll(organizationId, filters);
  }

  async findOne(id: string, organizationId: string) {
    const document = await this.documentsRepository.findById(
      id,
      organizationId,
    );
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    return document;
  }

  async create(
    organizationId: string,
    authorId: string,
    dto: CreateDocumentDto,
  ) {
    await this.assertValidContext(organizationId, dto);
    await this.access.assertProjectWritable(dto.projectId, authorId);

    const document = await this.documentsRepository.create({
      ...dto,
      organizationId,
      authorId,
    });

    const activityContext = resolveActivityContext(document);
    if (activityContext) {
      await this.activitiesService.log({
        ...activityContext,
        actorUserId: authorId,
        type: 'DOCUMENT_CREATED',
        message: `Dokument "${document.title}" wurde angelegt`,
      });
    }

    return document;
  }

  async update(
    id: string,
    organizationId: string,
    actorUserId: string,
    dto: UpdateDocumentDto,
  ) {
    const document = await this.findOne(id, organizationId);
    await this.access.assertProjectWritable(document.projectId, actorUserId);
    return this.documentsRepository.update(id, dto);
  }

  async archive(id: string, organizationId: string, actorUserId: string) {
    const document = await this.findOne(id, organizationId);
    await this.access.assertProjectWritable(document.projectId, actorUserId);
    const archived = await this.documentsRepository.archive(id);

    const activityContext = resolveActivityContext(document);
    if (activityContext) {
      await this.activitiesService.log({
        ...activityContext,
        actorUserId,
        type: 'DOCUMENT_ARCHIVED',
        message: `Dokument "${document.title}" wurde archiviert`,
      });
    }

    return archived;
  }

  async uploadVersion(
    documentId: string,
    organizationId: string,
    uploadedById: string,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ) {
    const document = await this.findOne(documentId, organizationId);
    await this.access.assertProjectWritable(document.projectId, uploadedById);

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`,
      );
    }

    const mimeType = resolveMimeType(file);
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new BadRequestException(
        `File type "${file.mimetype}" is not allowed`,
      );
    }

    assertFileSignature(file.buffer, mimeType);

    const versionNumber =
      await this.documentsRepository.getNextVersionNumber(documentId);
    const fileName = normalizeFileName(file.originalname);
    const storageKey = `documents/${documentId}/v${versionNumber}/${fileName}`;

    await this.storageService.upload({
      key: storageKey,
      data: file.buffer,
      mimeType,
    });

    const version = await this.documentsRepository.createVersion({
      documentId,
      versionNumber,
      storageKey,
      fileName,
      mimeType,
      sizeBytes: file.size,
      uploadedById,
    });

    await this.documentsRepository.setCurrentVersion(documentId, version.id);

    // Deliberately not awaited: the upload response must not wait for extraction.
    void this.extractTextInBackground(
      version.id,
      file.buffer,
      mimeType,
      fileName,
    );

    const result = await this.findOne(documentId, organizationId);

    const activityContext = resolveActivityContext(document);
    if (activityContext) {
      await this.activitiesService.log({
        ...activityContext,
        actorUserId: uploadedById,
        type: 'DOCUMENT_VERSION_ADDED',
        message: `Neue Version von "${document.title}" hochgeladen (v${versionNumber})`,
      });
    }

    return result;
  }

  private async extractTextInBackground(
    versionId: string,
    buffer: Buffer,
    mimeType: string,
    fileName: string,
  ) {
    try {
      const text = await this.textExtractionService.extractSafely(
        buffer,
        mimeType,
        `${fileName} (${versionId})`,
      );
      if (text) {
        await this.documentsRepository.setExtractedText(versionId, text);
      }
    } catch (error) {
      this.logger.warn(
        `Could not store extracted text for version ${versionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getDownloadUrl(
    documentId: string,
    organizationId: string,
    options: { disposition?: 'inline' | 'attachment'; versionId?: string } = {},
  ) {
    const document = await this.findOne(documentId, organizationId);

    const version = options.versionId
      ? document.versions.find(
          (candidate) => candidate.id === options.versionId,
        )
      : document.currentVersion;

    if (!version) {
      throw new NotFoundException(
        options.versionId
          ? 'Version not found'
          : 'Document has no uploaded version yet',
      );
    }

    return this.storageService.createDownloadUrl(version.storageKey, 300, {
      disposition: options.disposition ?? 'inline',
      fileName: version.fileName,
    });
  }
}
