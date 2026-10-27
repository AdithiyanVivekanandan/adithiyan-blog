import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";

import { CSRF_TTL_MS } from "./constants.ts";
import { CmsError } from "./errors.ts";
import { timingSafeEqual } from "./text.ts";

export interface CmsEnv {
  [key: string]: string | undefined;
}

export interface AccessConfig {
  teamDomain: string;
  audience: string;
  allowedEmails: string[];
}

export interface AccessIdentity {
  email: string;
  dev: boolean;
}

export type AccessTokenVerifier = (
  token: string,
  config: AccessConfig,
) => Promise<JWTPayload>;

export interface AuthOptions {
  verifyToken?: AccessTokenVerifier;
  now?: number;
}

const jwksCache = new Map<string, JWTVerifyGetKey>();

function normalizeTeamDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

export function accessConfigFromEnv(env: CmsEnv): AccessConfig {
  const teamDomain = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN ?? "");
  const audience = (env.CF_ACCESS_AUD ?? "").trim();
  const allowedEmails = (env.CMS_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  const missing: string[] = [];
  if (!teamDomain) missing.push("CF_ACCESS_TEAM_DOMAIN");
  if (!audience) missing.push("CF_ACCESS_AUD");
  if (allowedEmails.length === 0) missing.push("CMS_ALLOWED_EMAILS");
  if (missing.length > 0) {
    throw new CmsError(
      503,
      "not_configured",
      `The CMS auth configuration is incomplete: ${missing.join(", ")}.`,
    );
  }

  return { teamDomain, audience, allowedEmails };
}

function getJwks(teamDomain: string): JWTVerifyGetKey {
  const cached = jwksCache.get(teamDomain);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(
    new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
  );
  jwksCache.set(teamDomain, jwks);
  return jwks;
}

export async function verifyAccessTokenWithJwks(
  token: string,
  config: AccessConfig,
  jwks: JWTVerifyGetKey,
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://${config.teamDomain}`,
    audience: config.audience,
    clockTolerance: 5,
  });
  return payload;
}

async function defaultVerifier(
  token: string,
  config: AccessConfig,
): Promise<JWTPayload> {
  return verifyAccessTokenWithJwks(token, config, getJwks(config.teamDomain));
}

function devBypassAllowed(request: Request, env: CmsEnv): boolean {
  if (env.CMS_DEV_BYPASS !== "true") return false;
  if (env.CMS_ENVIRONMENT === "production") return false;
  if (env.CF_PAGES === "1" && env.CMS_ENVIRONMENT !== "local") return false;
  const hostname = new URL(request.url).hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

export async function verifyAccessRequest(
  request: Request,
  env: CmsEnv,
  options: AuthOptions = {},
): Promise<AccessIdentity> {
  if (devBypassAllowed(request, env)) {
    return {
      email: (env.CMS_DEV_EMAIL ?? "dev@localhost").trim().toLowerCase(),
      dev: true,
    };
  }

  const config = accessConfigFromEnv(env);
  const token = request.headers.get("cf-access-jwt-assertion")?.trim();
  if (!token) {
    throw new CmsError(
      401,
      "unauthenticated",
      "Cloudflare Access did not provide a signed identity for this request.",
    );
  }

  let payload: JWTPayload;
  try {
    payload = await (options.verifyToken ?? defaultVerifier)(token, config);
  } catch (error) {
    if (error instanceof CmsError) throw error;
    throw new CmsError(
      401,
      "unauthenticated",
      "The Cloudflare Access identity could not be verified.",
      { cause: error },
    );
  }

  const email =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email) {
    throw new CmsError(
      401,
      "unauthenticated",
      "The Cloudflare Access identity has no email claim.",
    );
  }
  if (!config.allowedEmails.includes(email)) {
    throw new CmsError(
      403,
      "forbidden",
      "This account is not allowed to use the publishing desk.",
    );
  }
  return { email, dev: false };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function hmac(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return new Uint8Array(signature);
}

function csrfSecret(env: CmsEnv): string {
  const secret = env.CMS_CSRF_SECRET ?? "";
  if (secret.trim().length < 32) {
    throw new CmsError(
      503,
      "not_configured",
      "CMS_CSRF_SECRET must be configured with at least 32 characters.",
    );
  }
  return secret;
}

export async function createCsrfToken(
  email: string,
  env: CmsEnv,
  now = Date.now(),
): Promise<string> {
  const secret = csrfSecret(env);
  const nonce = new Uint8Array(16);
  crypto.getRandomValues(nonce);
  const payload = {
    sub: email,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + CSRF_TTL_MS) / 1000),
    nonce: base64UrlEncode(nonce),
  };
  const encodedPayload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signature = await hmac(secret, encodedPayload);
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
}

export async function verifyCsrfToken(
  token: string | null,
  email: string,
  env: CmsEnv,
  now = Date.now(),
): Promise<void> {
  if (!token) {
    throw new CmsError(
      403,
      "forbidden",
      "This change needs a CSRF token from the current session.",
    );
  }
  const secret = csrfSecret(env);
  const [encodedPayload, encodedSignature, ...rest] = token.split(".");
  if (!encodedPayload || !encodedSignature || rest.length > 0) {
    throw new CmsError(403, "forbidden", "The CSRF token is malformed.");
  }
  const expected = await hmac(secret, encodedPayload);
  let provided: Uint8Array;
  try {
    provided = base64UrlDecode(encodedSignature);
  } catch {
    throw new CmsError(403, "forbidden", "The CSRF token is malformed.");
  }
  if (base64UrlEncode(provided) !== encodedSignature) {
    throw new CmsError(403, "forbidden", "The CSRF token is invalid.");
  }
  if (!timingSafeEqual(expected, provided)) {
    throw new CmsError(403, "forbidden", "The CSRF token is invalid.");
  }
  let payload: { sub?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(encodedPayload)),
    ) as { sub?: unknown; exp?: unknown };
  } catch {
    throw new CmsError(403, "forbidden", "The CSRF token is malformed.");
  }
  if (payload.sub !== email) {
    throw new CmsError(
      403,
      "forbidden",
      "The CSRF token belongs to another session.",
    );
  }
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= now) {
    throw new CmsError(
      403,
      "forbidden",
      "The CSRF token has expired. Reload the page.",
    );
  }
}

export async function requireWriteAuth(
  request: Request,
  env: CmsEnv,
  options: AuthOptions = {},
): Promise<AccessIdentity> {
  const identity = await verifyAccessRequest(request, env, options);
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new CmsError(
      403,
      "forbidden",
      "Cross-origin writes are not allowed (missing Origin header).",
    );
  }
  if (origin !== new URL(request.url).origin) {
    throw new CmsError(
      403,
      "forbidden",
      "Cross-origin writes are not allowed.",
    );
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new CmsError(403, "forbidden", "Cross-site writes are not allowed.");
  }
  await verifyCsrfToken(
    request.headers.get("x-cms-csrf"),
    identity.email,
    env,
    options.now,
  );
  return identity;
}

export function accessLogoutUrl(env: CmsEnv): string | null {
  const teamDomain = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN ?? "");
  return teamDomain ? `https://${teamDomain}/cdn-cgi/access/logout` : null;
}
