import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { COOKIE_NAME } from './auth/jwt.strategy';

/** TRUST_PROXY: "true", a hop count like "1", or an Express trust-proxy value (IP/subnet list). */
function parseTrustProxy(value: string): boolean | number | string {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  // Behind a reverse proxy (nginx, a load balancer) the client IP comes from X-Forwarded-For.
  // Without this, rate limiting sees every user as the proxy's IP.
  if (process.env.TRUST_PROXY) app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((o) => o.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();

  // API docs at /api/docs. On by default outside production; set SWAGGER_ENABLED=true to expose in prod.
  const swaggerFlag = process.env.SWAGGER_ENABLED; // empty string counts as "not set"
  const swaggerEnabled = swaggerFlag
    ? swaggerFlag === 'true'
    : process.env.NODE_ENV !== 'production';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Trusted Driver Network API')
      .setDescription(
        'Relationship-first transport platform: bookings, referrals, tracking, payments.',
      )
      .setVersion('1.0')
      .addCookieAuth(COOKIE_NAME)
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  logger.log(`Trusted Driver Network API listening on :${port}`);
}

bootstrap().catch((err: unknown) => {
  // Logger may not exist yet (e.g. invalid configuration), so write plainly and exit non-zero.
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
