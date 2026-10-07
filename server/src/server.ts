import type { Server } from 'node:http';
import { createApp } from './app';
import { disconnectCache } from './config/cache';
import { env, isProduction } from './config/env';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase } from './config/prisma';
import { assertDatabaseReachable } from './modules/health/health.service';

async function bootstrap(): Promise<void> {
  await connectDatabase();
  await assertDatabaseReachable();

  const app = createApp();

  const server: Server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, apiPrefix: env.API_PREFIX, corsOrigins: env.CORS_ORIGINS },
      `${env.APP_NAME} API listening on port ${env.PORT}`,
    );
  });

  server.headersTimeout = 65_000;
  server.requestTimeout = 60_000;

  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down gracefully');

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(() => {
      void Promise.allSettled([disconnectDatabase(), disconnectCache()]).then(() => {
        logger.info('Shutdown complete');
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason: reason instanceof Error ? reason.message : String(reason) }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error.message, stack: error.stack }, 'Uncaught exception — exiting');
    shutdown('uncaughtException');
  });

  if (isProduction) {
    logger.info('Running in production mode');
  }
}

bootstrap().catch((error: unknown) => {
  logger.fatal(
    { err: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined },
    'Failed to start server',
  );
  process.exit(1);
});
