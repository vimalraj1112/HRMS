import { Router } from 'express';
import { getLogoController } from './branding.controller';

export const brandingRouter = Router();

brandingRouter.get('/logo', getLogoController);
