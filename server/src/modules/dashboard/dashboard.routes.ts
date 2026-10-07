import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { getDashboardController } from './dashboard.controller';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

dashboardRouter.get('/', getDashboardController);
