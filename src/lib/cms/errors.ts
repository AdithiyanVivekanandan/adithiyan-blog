export type CmsErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "unsupported_media_type"
  | "rate_limited"
  | "upstream_error"
  | "not_configured"
  | "method_not_allowed"
  | "internal_error";

export class CmsError extends Error {
  readonly status: number;
  readonly code: CmsErrorCode;
  readonly details?: Record<string, unknown>;
  readonly retryAfter?: number;

  constructor(
    status: number,
    code: CmsErrorCode,
    message: string,
    options: {
      details?: Record<string, unknown>;
      retryAfter?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "CmsError";
    this.status = status;
    this.code = code;
    this.details = options.details;
    this.retryAfter = options.retryAfter;
  }
}

export function isCmsError(value: unknown): value is CmsError {
  return value instanceof CmsError;
}

export function asCmsError(value: unknown): CmsError {
  if (isCmsError(value)) return value;
  return new CmsError(500, "internal_error", "Something went wrong.");
}
