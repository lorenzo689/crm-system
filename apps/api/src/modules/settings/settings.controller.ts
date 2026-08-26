import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async get(@Req() req: Request) {
    const payload = req.user as JwtPayload;
    return this.settingsService.getOrCreate(payload.sub);
  }

  @Patch()
  async update(@Body() dto: UpdateSettingsDto, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    return this.settingsService.update(payload.sub, dto);
  }
}
