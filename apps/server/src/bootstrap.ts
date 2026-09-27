import { maintenance } from './common/maintenance';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyPluginCallback } from 'fastify';
import type { FastifyCookieOptions } from '@fastify/cookie';
import type { FastifyHelmetOptions } from '@fastify/helmet';
import type { FastifyMultipartOptions } from '@fastify/multipart';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { config } from './config';

/** main 与测试共用的应用装配（入参校验统一走 zod 管道，不用 class-validator） */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  app.setGlobalPrefix('api');
  await app.register(fastifyHelmet as FastifyPluginCallback<FastifyHelmetOptions>, {
    contentSecurityPolicy: false,
  });
  await app.register(fastifyCookie as FastifyPluginCallback<FastifyCookieOptions>);
  await app.register(fastifyMultipart as FastifyPluginCallback<FastifyMultipartOptions>, {
    limits: { fileSize: config.maxUploadBytes, files: 1 },
  });
  const fastify = app.getHttpAdapter().getInstance();
  const releases = new WeakMap<object, () => void>();
  fastify.addHook(
    'onRequest',
    async (
      req: { method: string; url: string },
      reply: { code: (n: number) => { send: (body: unknown) => void } },
    ) => {
      if (maintenance.locked) {
        reply.code(503).send({ message: '备份或恢复维护中，请稍后重试' });
        return;
      }
      const exclusive =
        req.method === 'POST' &&
        /^\/api\/system\/backups(?:\/[^/]+\/restore)?(?:\?|$)/.test(req.url);
      if (!exclusive) releases.set(req, maintenance.enter());
    },
  );
  const release = async (req: object) => {
    releases.get(req)?.();
    releases.delete(req);
  };
  fastify.addHook('onResponse', release);
  fastify.addHook('onError', release);
  app.useGlobalFilters(new PrismaExceptionFilter());
}
