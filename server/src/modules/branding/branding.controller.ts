import type { Request, Response } from 'express';
import { storage } from '../../services/storage.service';
import { ApiError } from '../../utils/ApiError';

const LOGO_KEY = 'company_logo.png';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/**
 * Streams the company logo stored at the storage root. The endpoint is
 * public because the login page renders it before a session exists.
 */
export async function getLogoController(_req: Request, res: Response): Promise<void> {
  const store = storage();
  if (!(await store.exists(LOGO_KEY))) throw ApiError.notFound('Company logo not found');

  const extension = LOGO_KEY.slice(LOGO_KEY.lastIndexOf('.')).toLowerCase();
  const [stream, size] = await Promise.all([store.readStream(LOGO_KEY), store.size(LOGO_KEY)]);

  res.setHeader('Content-Type', MIME_BY_EXTENSION[extension] ?? 'application/octet-stream');
  res.setHeader('Content-Length', String(size));
  res.setHeader('Cache-Control', 'public, max-age=300');
  stream.pipe(res);
}
