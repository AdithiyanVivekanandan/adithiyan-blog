import { CmsError, asCmsError, isCmsError } from "./errors.ts";

export const ADMIN_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "connect-src 'self'",
  "font-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

export function applyAdminHeaders(headers: Headers): void {
  headers.set("Content-Security-Policy", ADMIN_CSP);
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
}

export function withAdminHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  applyAdminHeaders(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
  });
  applyAdminHeaders(headers);
  for (const [name, value] of Object.entries(extraHeaders)) {
    headers.set(name, value);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export function errorResponse(error: unknown): Response {
  const cmsError = asCmsError(error);
  const headers: Record<string, string> = {};
  if (cmsError.retryAfter) {
    headers["Retry-After"] = String(cmsError.retryAfter);
  }
  return jsonResponse(
    {
      ok: false,
      error: {
        code: cmsError.code,
        message: cmsError.message,
        ...(cmsError.details ? { details: cmsError.details } : {}),
      },
    },
    cmsError.status,
    headers,
  );
}

export function htmlError(error: unknown): Response {
  const cmsError = asCmsError(error);
  const title =
    cmsError.status === 401 || cmsError.status === 403
      ? "Access denied"
      : cmsError.status === 503
        ? "Publishing desk not configured"
        : "Publishing desk unavailable";
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="robots" content="noindex, nofollow" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
</head>
<body>
<main>
<h1>${title}</h1>
<p>${escapeHtml(cmsError.message)}</p>
<p><a href="/">Return to the publication</a></p>
</main>
</body>
</html>`;
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
  });
  applyAdminHeaders(headers);
  return new Response(body, { status: cmsError.status, headers });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function methodNotAllowed(allow: readonly string[]): Response {
  return jsonResponse(
    {
      ok: false,
      error: {
        code: "method_not_allowed",
        message: `Use ${allow.join(" or ")} for this endpoint.`,
      },
    },
    405,
    { Allow: allow.join(", ") },
  );
}

export async function readFormData(
  request: Request,
  maxBytes: number,
): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new CmsError(
      415,
      "unsupported_media_type",
      "Send this upload as multipart/form-data.",
    );
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new CmsError(
      413,
      "payload_too_large",
      "Images must be 8 MB or smaller.",
    );
  }
  if (!request.body) {
    throw new CmsError(
      400,
      "bad_request",
      "The upload form could not be read.",
    );
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The stream may already be closed by the runtime.
        }
        throw new CmsError(
          413,
          "payload_too_large",
          "Images must be 8 MB or smaller.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return await new Request(request.url, {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    }).formData();
  } catch {
    throw new CmsError(
      400,
      "bad_request",
      "The upload form could not be read.",
    );
  }
}

export async function readJson<T>(
  request: Request,
  maxBytes = 600 * 1024,
): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new CmsError(
      415,
      "unsupported_media_type",
      "Send this request as application/json.",
    );
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new CmsError(413, "payload_too_large", "That request is too large.");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > maxBytes) {
    throw new CmsError(413, "payload_too_large", "That request is too large.");
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new CmsError(
      400,
      "bad_request",
      "The request body is not valid JSON.",
    );
  }
}

export async function handleRequest(
  request: Request,
  run: () => Promise<Response>,
): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (!isCmsError(error)) {
      console.error("cms_unhandled_error", {
        method: request.method,
        path: new URL(request.url).pathname,
        name: error instanceof Error ? error.name : "unknown",
      });
    }
    return errorResponse(error);
  }
}
