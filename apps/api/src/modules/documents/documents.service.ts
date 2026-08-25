import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { STORAGE_SERVICE } from '../../common/storage/storage.interface';
import type { StorageService } from '../../common/storage/storage.interface';
import { ActivitiesService } from '../activities/activities.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
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

function resolveActivityContext(document: {
  customerId: string | null;
  projectId: string | null;
}) {
  if (document.projectId) return { projectId: document.projectId };
  if (document.customerId) return { customerId: document.customerId };
  return {};
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly documentsRepository: DocumentsRepository,
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  private async assertValidContext(
    organizationId: string,
    context: { customerId?: string; projectId?: string },
  ) {
    if (!context.customerId && !context.projectId) {
      throw new BadRequestException(
        'Document must be linked to at least a customer or project',
      );
    }

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

    const document = await this.documentsRepository.create({
      ...dto,
      organizationId,
      authorId,
    });

    await this.activitiesService.log({
      ...resolveActivityContext(document),
      actorUserId: authorId,
      type: 'DOCUMENT_CREATED',
      message: `Dokument "${document.title}" wurde angelegt`,
    });

    return document;
  }

  async update(id: string, organizationId: string, dto: UpdateDocumentDto) {
    await this.findOne(id, organizationId);
    return this.documentsRepository.update(id, dto);
  }

  async archive(id: string, organizationId: string, actorUserId: string) {
    const document = await this.findOne(id, organizationId);
    const archived = await this.documentsRepository.archive(id);

    await this.activitiesService.log({
      ...resolveActivityContext(document),
      actorUserId,
      type: 'DOCUMENT_ARCHIVED',
      message: `Dokument "${document.title}" wurde archiviert`,
    });

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

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`,
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type "${file.mimetype}" is not allowed`,
      );
    }

    const versionNumber =
      await this.documentsRepository.getNextVersionNumber(documentId);
    const storageKey = `documents/${documentId}/v${versionNumber}/${file.originalname}`;

    await this.storageService.upload({
      key: storageKey,
      data: file.buffer,
      mimeType: file.mimetype,
    });

    const version = await this.documentsRepository.createVersion({
      documentId,
      versionNumber,
      storageKey,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedById,
    });

    await this.documentsRepository.setCurrentVersion(documentId, version.id);

    const result = await this.findOne(documentId, organizationId);

    await this.activitiesService.log({
      ...resolveActivityContext(document),
      actorUserId: uploadedById,
      type: 'DOCUMENT_VERSION_ADDED',
      message: `Neue Version von "${document.title}" hochgeladen (v${versionNumber})`,
    });

    return result;
  }

  async getDownloadUrl(documentId: string, organizationId: string) {
    const document = await this.findOne(documentId, organizationId);

    if (!document.currentVersion) {
      throw new NotFoundException('Document has no uploaded version yet');
    }

    return this.storageService.createDownloadUrl(
      document.currentVersion.storageKey,
      300,
    );
  }
}
