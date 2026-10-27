import {
  CMS_BASE,
  CMS_PATHS,
  MAX_MEDIA_BYTES,
  MAX_MEDIA_DIMENSION,
  MAX_MEDIA_PIXELS,
  MEDIA_EXTENSIONS,
} from "./constants.ts";
import { CmsError } from "./errors.ts";
import type { MediaInfo } from "./types.ts";
import { joinRepoPath } from "./text.ts";

export type ImageType = "png" | "jpeg" | "gif" | "webp";

export interface ImageDetails {
  type: ImageType;
  extension: string;
  mime: string;
  width: number;
  height: number;
}

const MIME_BY_TYPE: Record<ImageType, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

const EXTENSION_BY_TYPE: Record<ImageType, string> = {
  png: "png",
  jpeg: "jpg",
  gif: "gif",
  webp: "webp",
};

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return new TextDecoder("latin1").decode(
    bytes.subarray(offset, offset + length),
  );
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint16(offset, false);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(offset, false);
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint16(offset, true);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(offset, true);
}

function detectType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "gif";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    ascii(bytes, 8, 4) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== "IHDR") {
    throw new CmsError(
      415,
      "unsupported_media_type",
      "The PNG header is invalid.",
    );
  }
  return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
}

function gifDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 10) {
    throw new CmsError(
      415,
      "unsupported_media_type",
      "The GIF header is invalid.",
    );
  }
  return { width: readUint16LE(bytes, 6), height: readUint16LE(bytes, 8) };
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    let markerOffset = offset + 1;
    while (markerOffset < bytes.length && bytes[markerOffset] === 0xff) {
      markerOffset += 1;
    }
    if (markerOffset >= bytes.length) break;
    const marker = bytes[markerOffset];
    offset = markerOffset + 1;
    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (offset + 2 > bytes.length) break;
    const length = readUint16BE(bytes, offset);
    if (length < 2 || offset + length > bytes.length) break;
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      if (offset + 7 > bytes.length) break;
      return {
        height: readUint16BE(bytes, offset + 3),
        width: readUint16BE(bytes, offset + 5),
      };
    }
    offset += length;
  }
  throw new CmsError(
    415,
    "unsupported_media_type",
    "The JPEG dimensions could not be read.",
  );
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 30) {
    throw new CmsError(
      415,
      "unsupported_media_type",
      "The WebP header is invalid.",
    );
  }
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X") {
    return {
      width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
      height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
    };
  }
  if (chunk === "VP8 ") {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      throw new CmsError(
        415,
        "unsupported_media_type",
        "The WebP frame is invalid.",
      );
    }
    return {
      width: readUint16LE(bytes, 26) & 0x3fff,
      height: readUint16LE(bytes, 28) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    if (bytes[20] !== 0x2f) {
      throw new CmsError(
        415,
        "unsupported_media_type",
        "The WebP frame is invalid.",
      );
    }
    const bits = readUint32LE(bytes, 21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  throw new CmsError(
    415,
    "unsupported_media_type",
    "Unsupported WebP encoding.",
  );
}

export function inspectImage(bytes: Uint8Array): ImageDetails {
  if (bytes.length === 0) {
    throw new CmsError(400, "validation_failed", "The image file is empty.");
  }
  if (bytes.length > MAX_MEDIA_BYTES) {
    throw new CmsError(
      413,
      "payload_too_large",
      "Images must be 8 MB or smaller.",
    );
  }
  const probe = ascii(bytes, 0, Math.min(bytes.length, 512)).toLowerCase();
  if (
    probe.includes("<svg") ||
    probe.includes("<html") ||
    probe.includes("<?xml")
  ) {
    throw new CmsError(
      415,
      "unsupported_media_type",
      "SVG and HTML files are not accepted. Upload PNG, JPEG, WebP or GIF images.",
    );
  }
  const type = detectType(bytes);
  if (!type) {
    throw new CmsError(
      415,
      "unsupported_media_type",
      "The file is not a valid PNG, JPEG, WebP or GIF image.",
    );
  }
  const dimensions =
    type === "png"
      ? pngDimensions(bytes)
      : type === "gif"
        ? gifDimensions(bytes)
        : type === "jpeg"
          ? jpegDimensions(bytes)
          : webpDimensions(bytes);
  if (
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    dimensions.width > MAX_MEDIA_DIMENSION ||
    dimensions.height > MAX_MEDIA_DIMENSION
  ) {
    throw new CmsError(
      415,
      "unsupported_media_type",
      `Images must be between 1 and ${MAX_MEDIA_DIMENSION} pixels per side.`,
    );
  }
  if (dimensions.width * dimensions.height > MAX_MEDIA_PIXELS) {
    throw new CmsError(
      413,
      "payload_too_large",
      "Images must be 40 megapixels or smaller.",
    );
  }
  return {
    type,
    extension: EXTENSION_BY_TYPE[type],
    mime: MIME_BY_TYPE[type],
    width: dimensions.width,
    height: dimensions.height,
  };
}

export function sanitizeMediaFilename(
  originalName: string,
  extension: string,
): string {
  const base = originalName.split(/[/\\]/).pop() ?? "";
  const stem = base
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return `${stem || "image"}.${extension}`;
}

export function isSupportedExtension(filename: string): boolean {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return MEDIA_EXTENSIONS.includes(
    extension as (typeof MEDIA_EXTENSIONS)[number],
  );
}

export function mediaMimeType(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  return "application/octet-stream";
}

export function mediaPath(
  scope: "draft" | "published",
  slug: string,
  filename: string,
): string {
  return scope === "draft"
    ? joinRepoPath(CMS_PATHS.draftMedia, slug, filename)
    : joinRepoPath(CMS_PATHS.publishedMedia, slug, filename);
}

export function mediaUrl(
  scope: "draft" | "published",
  slug: string,
  filename: string,
): string {
  return scope === "draft"
    ? `${CMS_BASE}/api/media/draft/${slug}/${filename}`
    : `/images/${slug}/${filename}`;
}

export function validateMediaFile(
  bytes: Uint8Array,
  originalName: string,
): { filename: string; details: ImageDetails } {
  const details = inspectImage(bytes);
  const filename = sanitizeMediaFilename(originalName, details.extension);
  if (!isSupportedExtension(filename)) {
    throw new CmsError(
      415,
      "unsupported_media_type",
      "Unsupported image type.",
    );
  }
  return { filename, details };
}

export function validateAltText(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CmsError(
      400,
      "validation_failed",
      "Alt text is required. Describe what the image shows.",
      { details: { field: "alt" } },
    );
  }
  const trimmed = value.trim();
  if (trimmed.length > 200) {
    throw new CmsError(
      400,
      "validation_failed",
      "Alt text must be 200 characters or fewer.",
      { details: { field: "alt" } },
    );
  }
  return trimmed;
}

export function validateCaption(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new CmsError(400, "validation_failed", "The caption must be text.");
  }
  const trimmed = value.trim();
  if (trimmed.length > 400) {
    throw new CmsError(
      400,
      "validation_failed",
      "The caption must be 400 characters or fewer.",
    );
  }
  return trimmed || undefined;
}

export function draftMediaUrlPattern(slug: string): RegExp {
  return new RegExp(
    `${CMS_BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/api/media/draft/${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([a-z0-9][a-z0-9._-]*)`,
    "gi",
  );
}

export function extractDraftMediaFilenames(
  text: string,
  slug: string,
): string[] {
  const pattern = draftMediaUrlPattern(slug);
  const found = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    found.add(match[1]);
  }
  return [...found];
}

export function replaceDraftMediaUrls(
  text: string,
  slug: string,
  mapping: ReadonlyMap<string, string>,
): string {
  let result = text;
  for (const [filename, url] of mapping) {
    const pattern = new RegExp(
      `${CMS_BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/api/media/draft/${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/${filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "g",
    );
    result = result.replace(pattern, url);
  }
  return result;
}

export function findMediaReferences(
  entries: readonly { slug: string; text: string }[],
  url: string,
): string[] {
  return entries
    .filter((entry) => entry.text.includes(url))
    .map((entry) => entry.slug)
    .filter((slug, index, all) => all.indexOf(slug) === index)
    .sort();
}

export function buildMediaFigure(
  url: string,
  alt: string,
  width: number | undefined,
  height: number | undefined,
  caption: string | undefined,
): string {
  const dimensions =
    width && height ? ` width="${width}" height="${height}"` : "";
  const captionMarkup = caption
    ? `\n  <figcaption>${caption}</figcaption>`
    : "";
  return `<figure>\n  <img src="${url}" alt="${alt}"${dimensions} loading="lazy" decoding="async" />${captionMarkup}\n</figure>`;
}

export function toMediaInfo(
  scope: "draft" | "published",
  slug: string,
  filename: string,
  size: number,
  sha: string,
  dimensions?: { width: number; height: number },
): MediaInfo {
  return {
    filename,
    path: mediaPath(scope, slug, filename),
    url: mediaUrl(scope, slug, filename),
    size,
    sha,
    ...(dimensions
      ? { width: dimensions.width, height: dimensions.height }
      : {}),
  };
}
