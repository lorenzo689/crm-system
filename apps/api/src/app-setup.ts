import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import { json } from 'express';
import helmet from 'helmet';
import {
  createOriginGuardMiddleware,
  getAllowedOrigins,
  noStoreMiddleware,
} from './common/http/request-origin';
import {
  RequestIdExceptionFilter,
  requestContextMiddleware,
} from './common/http/request-context';
import { CSRF_HEADER } from './modules/auth/csrf';

/**
 * HTTP pipeline shared by the real server and the integration tests, so the
 * tests exercise exactly the CORS, Origin and body-parsing rules that ship.
 * The application must be created with `bodyParser: false`: only JSON (and
 * multipart through multer on upload routes) is accepted; no urlencoded
 * parser exists that an HTML form could target.
 */
export function configureApp(app: NestExpressApplication) {
  const allowedOrigins = getAllowedOrigins();

  app.disable('x-powered-by');
  // Needed so the throttler sees the real client IP behind a reverse proxy.
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
  }

  // Request id + access log first, so even rejected requests are traceable.
  app.use(requestContextMiddleware);
  app.use(helmet());
  app.use(compression());
  // Rejects foreign origins before any body is parsed or route runs.
  app.use(createOriginGuardMiddleware(allowedOrigins));
  app.use('/api', noStoreMiddleware);
  // Bank statements can be a few MB; every other route keeps the small limit.
  app.use('/api/v1/finance/bank/import', json({ limit: '3mb' }));
  app.use(json({ limit: '100kb' }));

  app.setGlobalPrefix('api/v1');
  // Production is same-origin (Caddy serves web and /api on one host), so CORS
  // only matters for local development (localhost:3000 -> localhost:4000).
  // Credentialed CORS is granted to the exact allowlist, never to "*".
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', CSRF_HEADER],
    maxAge: 600,
  });
  app.useGlobalFilters(new RequestIdExceptionFilter(app.getHttpAdapter()));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
