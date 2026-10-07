import multer from 'multer';
import { allowedUploadMimeTypes, env } from '../config/env';
import { ApiError } from '../utils/ApiError';

const ALLOWED_MIME_TYPES = new Set(allowedUploadMimeTypes);
export const maxUploadBytes = env.UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
      callback(
        ApiError.badRequest(
          `Unsupported file type "${file.mimetype}". Allowed types: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
        ),
      );
      return;
    }
    callback(null, true);
  },
});

/**
 * Uploads are buffered in memory so the size and MIME allow-list can be
 * enforced before anything touches storage. The size cap keeps that safe.
 */
export const uploadSingleFile = upload.single('file');