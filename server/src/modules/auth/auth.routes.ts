import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authRateLimiter } from '../../middleware/rateLimit.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  changePasswordController,
  loginController,
  logoutAllController,
  logoutController,
  meController,
  refreshController,
} from './auth.controller';
import { changePasswordSchema, loginSchema } from './auth.validator';

export const authRouter = Router();

authRouter.post('/login', authRateLimiter, validate({ body: loginSchema }), loginController);
authRouter.post('/refresh', authRateLimiter, refreshController);
authRouter.post('/logout', authenticate, logoutController);
authRouter.post('/logout-all', authenticate, logoutAllController);
authRouter.get('/me', authenticate, meController);
authRouter.post('/change-password', authenticate, validate({ body: changePasswordSchema }), changePasswordController);
