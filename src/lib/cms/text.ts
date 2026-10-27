import { CmsError } from "./errors.ts";
import { SLUG_PATTERN } from "./constants.ts";

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function utf8ToBase64(value: string): string {
  return bytesToBase64(new TextEncoder().encode(value));
}

export function base64ToUtf8(value: string): string {
  return new TextDecoder().decode(base64ToBytes(value));
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function isSafeSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export function assertSafeSlug(slug: string): string {
  const trimmed = slug.trim();
  if (!isSafeSlug(trimmed)) {
    throw new CmsError(
      400,
      "validation_failed",
      "The slug must be lowercase letters, numbers and single hyphens (for example: understanding-windows-executables).",
      { details: { field: "slug" } },
    );
  }
  return trimmed;
}

export function slugifyTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function assertSafeRelativePath(path: string): string {
  const trimmed = path.trim();
  if (
    trimmed.length === 0 ||
    trimmed.startsWith("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("\0") ||
    trimmed.split("/").some((part) => part === ".." || part === ".")
  ) {
    throw new CmsError(400, "bad_request", "Unsafe repository path.");
  }
  return trimmed;
}

export function joinRepoPath(...parts: string[]): string {
  return parts
    .filter((part) => part.length > 0)
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .join("/");
}

export function parseIsoDate(value: string | Date, field: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new CmsError(
      400,
      "validation_failed",
      `${field} is not a valid date.`,
      {
        details: { field },
      },
    );
  }
  return date;
}

export function toIsoString(value: string | Date): string {
  return parseIsoDate(value, "date").toISOString();
}

export function isoDateOnly(value: string | Date): string {
  return parseIsoDate(value, "date").toISOString().slice(0, 10);
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index] ^ b[index];
  }
  return diff === 0;
}

export async function mapLimit<T, R>(
  values: readonly T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, values.length)) },
    async () => {
      while (next < values.length) {
        const index = next;
        next += 1;
        results[index] = await mapper(values[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
