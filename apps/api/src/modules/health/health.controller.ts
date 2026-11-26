import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { HealthService } from './health.service';

/**
 * Public, unauthenticated probes. They reveal only ok/error per dependency.
 * - GET /health/live  : 200 while the process runs (container liveness).
 * - GET /health/ready : 200 when DB, object storage and schema are usable,
 *                       503 otherwise (proxy/orchestrator readiness).
 * - GET /health       : same as /health/ready (kept for existing probes).
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @HttpCode(200)
  live() {
    return this.healthService.live();
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    return this.respond(res);
  }

  @Get()
  async health(@Res({ passthrough: true }) res: Response) {
    return this.respond(res);
  }

  private async respond(res: Response) {
    const report = await this.healthService.readiness();
    res.status(report.status === 'ok' ? 200 : 503);
    return report;
  }
}
