import { Injectable } from '@nestjs/common';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsRepository } from './settings.repository';

@Injectable()
export class SettingsService {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  async getOrCreate(userId: string) {
    const existing = await this.settingsRepository.findByUserId(userId);
    if (existing) {
      return existing;
    }
    return this.settingsRepository.create(userId);
  }

  async update(userId: string, dto: UpdateSettingsDto) {
    await this.getOrCreate(userId);
    return this.settingsRepository.update(userId, dto);
  }
}
