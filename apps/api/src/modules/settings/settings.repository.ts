import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string) {
    return this.prisma.userSetting.findUnique({
      where: { userId },
    });
  }

  async create(userId: string) {
    return this.prisma.userSetting.create({
      data: { userId },
    });
  }

  async update(userId: string, data: Prisma.UserSettingUpdateInput) {
    return this.prisma.userSetting.update({
      where: { userId },
      data,
    });
  }
}
