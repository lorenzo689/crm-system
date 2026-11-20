import 'dotenv/config';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app-setup';
import { assertBackgroundJobConfig } from './common/jobs/background-jobs.config';
import { assertAuthConfig } from './modules/auth/auth-config';

async function bootstrap() {
  // Refuse to start with an unsafe auth configuration instead of failing later.
  assertAuthConfig();
  assertBackgroundJobConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    // LOG_FORMAT=json: one JSON object per line (containers, log shipping).
    logger: new ConsoleLogger({ json: process.env.LOG_FORMAT === 'json' }),
  });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 4000);
}

void bootstrap();
