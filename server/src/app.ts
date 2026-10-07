import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors, { type CorsOptions } from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { corsOrigins, env, isProduction } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { apiRateLimiter } from './middleware/rateLimit.middleware';
import { v1Router } from './routes';

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin || corsOrigins.length === 0 || corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86400,
};

export function createApp(): Application {
  const app = express();

  app.set('trust proxy', isProduction ? 1 : false);
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
        res.setHeader('x-request-id', requestId);
        return requestId;
      },
      autoLogging: {
        ignore: (req) => req.url === '/api/v1/health' || req.url === '/health',
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      customSuccessMessage: (req, res) => `${req.method} ${req.url} -> ${res.statusCode}`,
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use(cors(corsOptions));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  app.get('/', (_req, res) => {
    res.json({
      success: true,
      message: `${env.APP_NAME} API`,
      data: { name: env.APP_NAME, version: '1.0.0', apiPrefix: env.API_PREFIX, docs: '/api/v1/health' },
      meta: null,
    });
  });

  app.use(env.API_PREFIX, apiRateLimiter, v1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
