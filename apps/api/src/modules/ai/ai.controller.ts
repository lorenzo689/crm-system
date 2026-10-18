import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { Request, Response } from 'express';
import { AiProposalStatus } from '../../../generated/prisma/enums';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import { AiAgentsService } from './ai-agents.service';
import { AiChatService } from './ai-chat.service';
import { AiProposalsService } from './ai-proposals.service';
import { PrismaService } from '../../common/prisma/prisma.service';

class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(8000)
  content!: string;
}

class ChatDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];
}

class ListProposalsQuery {
  @IsOptional()
  @IsEnum(AiProposalStatus)
  status?: AiProposalStatus;
}

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly chatService: AiChatService,
    private readonly proposals: AiProposalsService,
    private readonly agents: AiAgentsService,
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  private async scope(req: Request) {
    const payload = req.user as JwtPayload;
    return {
      userId: payload.sub,
      organizationId: await this.usersService.getOrganizationId(payload.sub),
    };
  }

  @Get('status')
  async status(@Req() req: Request) {
    const { organizationId } = await this.scope(req);
    return {
      configured: this.chatService.isConfigured(),
      model: this.chatService.model,
      pendingProposals: await this.proposals.pendingCount(organizationId),
    };
  }

  // Each chat turn can fan out into several model calls, so keep a tight cap.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('chat')
  async chat(@Body() dto: ChatDto, @Req() req: Request) {
    const { organizationId, userId } = await this.scope(req);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayName: true },
    });
    const result = await this.chatService.chat(dto.messages, {
      organizationId,
      userId,
      userName: user.displayName,
    });
    const proposals = result.proposalIds.length
      ? (await this.proposals.list(organizationId)).filter((proposal) =>
          result.proposalIds.includes(proposal.id),
        )
      : [];
    return { reply: result.reply, proposals };
  }

  /** Same as POST /chat, but streams Server-Sent Events while the model works. */
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('chat/stream')
  async chatStream(
    @Body() dto: ChatDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { organizationId, userId } = await this.scope(req);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayName: true },
    });

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform keeps the compression middleware from buffering events.
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const send = (event: Record<string, unknown>) =>
      res.write(`data: ${JSON.stringify(event)}\n\n`);

    try {
      const result = await this.chatService.chat(
        dto.messages,
        { organizationId, userId, userName: user.displayName },
        (event) => send(event),
      );
      const proposals = result.proposalIds.length
        ? (await this.proposals.list(organizationId)).filter((proposal) =>
            result.proposalIds.includes(proposal.id),
          )
        : [];
      send({ type: 'done', reply: result.reply, proposals });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'KI-Anfrage fehlgeschlagen';
      send({ type: 'error', message });
    } finally {
      res.end();
    }
  }

  @Get('proposals')
  async list(@Query() query: ListProposalsQuery, @Req() req: Request) {
    const { organizationId } = await this.scope(req);
    return this.proposals.list(organizationId, query.status);
  }

  @Post('proposals/:id/approve')
  async approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const { organizationId, userId } = await this.scope(req);
    return this.proposals.approve(id, organizationId, userId);
  }

  @Post('proposals/:id/reject')
  async reject(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const { organizationId, userId } = await this.scope(req);
    return this.proposals.reject(id, organizationId, userId);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('agents/run')
  async runAgents(@Req() req: Request) {
    const { organizationId } = await this.scope(req);
    return { created: await this.agents.runForOrganization(organizationId) };
  }
}
