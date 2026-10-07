export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly errors: FieldError[];
  readonly code?: string;
  readonly isOperational: boolean;

  constructor(statusCode: number, message: string, options: { errors?: FieldError[]; code?: string } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = options.errors ?? [];
    this.code = options.code;
    this.isOperational = true;
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(message: string, errors: FieldError[] = []): ApiError {
    return new ApiError(400, message, { errors });
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(401, message, { code: 'UNAUTHENTICATED' });
  }

  static forbidden(message = 'You do not have permission to perform this action'): ApiError {
    return new ApiError(403, message, { code: 'FORBIDDEN' });
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, message, { code: 'NOT_FOUND' });
  }

  static conflict(message: string, errors: FieldError[] = []): ApiError {
    return new ApiError(409, message, { errors, code: 'CONFLICT' });
  }

  static unprocessable(message: string, errors: FieldError[] = []): ApiError {
    return new ApiError(422, message, { errors, code: 'BUSINESS_RULE_VIOLATION' });
  }

  static tooManyRequests(message = 'Too many requests, please try again later'): ApiError {
    return new ApiError(429, message, { code: 'RATE_LIMITED' });
  }

  static internal(message = 'Something went wrong'): ApiError {
    return new ApiError(500, message, { code: 'INTERNAL_ERROR' });
  }
}
