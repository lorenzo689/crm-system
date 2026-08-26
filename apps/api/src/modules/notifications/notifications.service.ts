import { Injectable } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationsRepository: NotificationsRepository,
  ) {}

  async findAllForUser(userId: string) {
    return this.notificationsRepository.findAllForUser(userId);
  }

  async countUnread(userId: string) {
    const count = await this.notificationsRepository.countUnread(userId);
    return { count };
  }

  async create(params: {
    userId: string;
    type: string;
    title: string;
    message: string;
    reminderId?: string;
  }) {
    return this.notificationsRepository.create(params);
  }

  async markAsRead(id: string, userId: string) {
    await this.notificationsRepository.markAsRead(id, userId);
  }

  async markAllAsRead(userId: string) {
    await this.notificationsRepository.markAllAsRead(userId);
  }
}
