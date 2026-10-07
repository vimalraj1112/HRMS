import pino from 'pino';
import { env, isDevelopment, isProduction } from './env';

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.confirmPassword',
  'req.body.refreshToken',
  'password',
  'passwordHash',
  'refreshToken',
  'accessToken',
  'token',
];

export const logger = pino({
  level: isProduction ? env.LOG_LEVEL : isDevelopment ? env.LOG_LEVEL : 'silent',
  redact: { paths: redactPaths, censor: '[REDACTED]' },
  base: { service: 'superlink-hrms-api', env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDevelopment && env.LOG_PRETTY
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service,env' },
        },
      }
    : {}),
});

export type Logger = typeof logger;
