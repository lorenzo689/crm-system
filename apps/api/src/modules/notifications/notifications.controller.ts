import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async findAll(@Req() req: Request) {
    const payload = req.user as JwtPayload;
    return this.notificationsService.findAllForUser(payload.sub);
  }

  @Get('unread-count')
  async countUnread(@Req() req: Request) {
    const payload = req.user as JwtPayload;
    return this.notificationsService.countUnread(payload.sub);
  }

  @Post(':id/read')
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const payload = req.user as JwtPayload;
    await this.notificationsService.markAsRead(id, payload.sub);
    return { success: true };
  }

  @Post('read-all')
  async markAllAsRead(@Req() req: Request) {
    const payload = req.user as JwtPayload;
    await this.notificationsService.markAllAsRead(payload.sub);
    return { success: true };
  }
}
