import 'dotenv/config';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // Keep-alive and a short idle timeout stop the pool from handing out
    // sockets that a proxy (e.g. Docker's port forwarder) has silently dropped.
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL ?? '',
      max: Number(process.env.DATABASE_POOL_SIZE) || 10,
      keepAlive: true,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    super({
      adapter,
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
