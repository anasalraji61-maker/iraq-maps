import 'reflect-metadata';
import { healthContract, type Clock, type OtpSender, type UserDataEraser } from '@iraq-maps/contracts';
import { Controller, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';

// Nest DI note: tsx/esbuild/vite do not emit decorator metadata, so always inject with explicit @Inject(token).

@Controller()
class HealthController {
  @TsRestHandler(healthContract.health)
  health() {
    return tsRestHandler(healthContract.health, async () => ({ status: 200, body: { status: 'ok', version: '0.0.0' } }));
  }
}

@Module({ controllers: [HealthController] })
class AppModule {}

/** Test/e2e seams. Production uses env-selected implementations. */
export interface CreateAppOptions {
  env?: Record<string, string | undefined>;
  otpSender?: OtpSender;
  clock?: Clock;
  erasers?: UserDataEraser[];
  logger?: boolean;
}

/** Composition root: wires modules and port bindings. Call app.listen() yourself, or use app.inject() in tests. */
export async function createApp(opts: CreateAppOptions = {}): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: opts.logger ? undefined : false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
