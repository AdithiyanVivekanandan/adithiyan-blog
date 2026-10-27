import { APPROVED_TOPICS, type TopicSlug } from "../topics.ts";
import { ARTICLE_TYPES, type ArticleType } from "../article-type.ts";
import {
  CMS_BASE,
  IMAGE_URL_PREFIXES,
  MAX_MARKDOWN_BYTES,
  MEDIA_EXTENSIONS,
  RAW_HTML_ALLOWED_TAGS,
  RAW_HTML_DANGEROUS_URI_PATTERN,
  RAW_HTML_EVENT_PATTERN,
  RAW_HTML_FORBIDDEN_TAG_PATTERN,
  RAW_HTML_SRCDOC_PATTERN,
  RAW_HTML_STYLE_PATTERN,
} from "./constants.ts";
import { CmsError } from "./errors.ts";
import type {
  ArticleFrontmatter,
  ArticleInput,
  ArticleReference,
  SaveMode,
} from "./types.ts";
import {
  assertSafeSlug,
  isPlainObject,
  parseIsoDate,
  truncate,
} from "./text.ts";

const ALLOWED_TAGS = new Set<string>(RAW_HTML_ALLOWED_TAGS);
const ALLOWED_TOPICS = new Set<string>(APPROVED_TOPICS);
const ALLOWED_TYPES = new Set<string>(ARTICLE_TYPES);
const KNOWN_FIELDS = new Set([
  "title",
  "subtitle",
  "slug",
  "description",
  "publishedAt",
  "updatedAt",
  "status",
  "topics",
  "articleType",
  "references",
  "technicalContext",
  "limitations",
  "coverImage",
  "coverAlt",
  "cmsUpdatedAt",
  "cmsArchivedAt",
]);

export interface NormalizeOptions {
  mode: SaveMode;
  now?: Date;
}

export interface NormalizedArticle extends ArticleInput {
  warnings: string[];
}

function fieldError(
  field: string,
  message: string,
  details: Record<string, unknown> = {},
): never {
  throw new CmsError(400, "validation_failed", message, {
    details: { field, ...details },
  });
}

function readString(
  value: unknown,
  field: string,
  options: { min?: number; max: number; optional?: boolean },
): string | undefined {
  if (value === undefined || value === null) {
    if (options.optional) return undefined;
    fieldError(field, `${field} is required.`);
  }
  if (typeof value !== "string") {
    fieldError(field, `${field} must be text.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    if (options.optional) return undefined;
    fieldError(field, `${field} is required.`);
  }
  if (options.min !== undefined && trimmed.length < options.min) {
    fieldError(field, `${field} must be at least ${options.min} characters.`);
  }
  if (trimmed.length > options.max) {
    fieldError(field, `${field} must be at most ${options.max} characters.`);
  }
  return trimmed;
}

function readDate(
  value: unknown,
  field: string,
  now: Date,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (
    typeof value !== "string" &&
    !(value instanceof Date) &&
    typeof value !== "number"
  ) {
    fieldError(field, `${field} must be an ISO date.`);
  }
  const date = parseIsoDate(value as string | Date, field);
  if (date.getTime() > now.getTime() + 5 * 60 * 1000) {
    fieldError(field, `${field} cannot be in the future.`);
  }
  return date.toISOString();
}

function readReferences(value: unknown): ArticleReference[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    fieldError("references", "references must be a list.");
  }
  if (value.length > 50) {
    fieldError("references", "Keep references to 50 entries or fewer.");
  }
  const references: ArticleReference[] = [];
  value.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      fieldError(`references[${index}]`, "Each reference must be an object.");
    }
    const title = readString(entry.title, `references[${index}].title`, {
      max: 200,
    }) as string;
    const urlValue = readString(entry.url, `references[${index}].url`, {
      max: 2000,
    }) as string;
    let url: URL;
    try {
      url = new URL(urlValue);
    } catch {
      fieldError(
        `references[${index}].url`,
        "Each reference URL must be an absolute URL.",
      );
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      fieldError(
        `references[${index}].url`,
        "Reference URLs must use http or https.",
      );
    }
    if (url.username || url.password) {
      fieldError(
        `references[${index}].url`,
        "Reference URLs must not contain credentials.",
      );
    }
    const annotation = readString(
      entry.annotation,
      `references[${index}].annotation`,
      { max: 500, optional: true },
    );
    references.push({
      title,
      url: url.href,
      ...(annotation ? { annotation } : {}),
    });
  });
  return references.length > 0 ? references : undefined;
}

function normalizeTopics(value: unknown): TopicSlug[] {
  if (!Array.isArray(value) || value.length === 0) {
    fieldError("topics", "Choose at least one topic.");
  }
  const topics: TopicSlug[] = [];
  for (const topic of value) {
    if (typeof topic !== "string" || !ALLOWED_TOPICS.has(topic)) {
      fieldError("topics", "Topics must come from the approved taxonomy.");
    }
    if (!topics.includes(topic as TopicSlug)) {
      topics.push(topic as TopicSlug);
    }
  }
  if (topics.length > APPROVED_TOPICS.length) {
    fieldError("topics", "Too many topics.");
  }
  return topics;
}

function normalizeArticleType(value: unknown): ArticleType | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !ALLOWED_TYPES.has(value)) {
    fieldError("articleType", "The article type is not recognised.");
  }
  return value as ArticleType;
}

function stripCode(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/`[^`\n]*`/g, "");
}

function isAllowedImagePath(
  value: string,
  slug: string,
  allowDraft: boolean,
): boolean {
  if (
    value.includes("..") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.includes("?") ||
    value.includes("#") ||
    value.startsWith("//")
  ) {
    return false;
  }
  const extension = value.split(".").pop()?.toLowerCase() ?? "";
  if (
    !MEDIA_EXTENSIONS.includes(extension as (typeof MEDIA_EXTENSIONS)[number])
  ) {
    return false;
  }

  if (value.startsWith("/images/")) {
    const parts = value.slice("/images/".length).split("/");
    return parts.length === 2 && parts[0] === slug && parts[1].length > 0;
  }

  if (allowDraft) {
    const prefix = `${CMS_BASE}/api/media/draft/${slug}/`;
    if (value.startsWith(prefix)) {
      const filename = value.slice(prefix.length);
      return filename.length > 0 && !filename.includes("/");
    }
  }
  return false;
}

function checkImageUrl(
  value: string,
  field: string,
  slug: string,
  mode: SaveMode,
): void {
  if (!isAllowedImagePath(value, slug, mode === "draft")) {
    fieldError(
      field,
      mode === "draft"
        ? "Images must be uploaded to this article's media library."
        : "Published articles can only reference media under /images/<slug>/.",
    );
  }
}

export function validateMarkdownBody(
  body: string,
  slug: string,
  mode: SaveMode,
): void {
  if (typeof body !== "string") {
    fieldError("body", "The article body must be text.");
  }
  if (new TextEncoder().encode(body).length > MAX_MARKDOWN_BYTES) {
    throw new CmsError(
      413,
      "payload_too_large",
      "The article body is larger than the 512 KB limit.",
      { details: { field: "body" } },
    );
  }
  if (mode === "publish" && body.trim().length === 0) {
    fieldError("body", "An article cannot be published with an empty body.");
  }

  const prose = stripCode(body);

  if (RAW_HTML_FORBIDDEN_TAG_PATTERN.test(prose)) {
    fieldError(
      "body",
      "Executable or container HTML tags are not allowed in article content.",
    );
  }
  if (RAW_HTML_EVENT_PATTERN.test(prose)) {
    fieldError(
      "body",
      "Inline event handlers are not allowed in article HTML.",
    );
  }
  if (RAW_HTML_DANGEROUS_URI_PATTERN.test(prose)) {
    fieldError(
      "body",
      "javascript:, vbscript: and data: URLs are not allowed in article HTML.",
    );
  }
  if (RAW_HTML_STYLE_PATTERN.test(prose)) {
    fieldError(
      "body",
      "Inline style attributes are not allowed in article HTML.",
    );
  }
  if (RAW_HTML_SRCDOC_PATTERN.test(prose)) {
    fieldError("body", "srcdoc attributes are not allowed in article HTML.");
  }

  const tags = [...prose.matchAll(/<\s*\/?\s*([a-zA-Z][\w-]*)/g)].map((match) =>
    match[1].toLowerCase(),
  );
  const unapproved = [...new Set(tags.filter((tag) => !ALLOWED_TAGS.has(tag)))];
  if (unapproved.length > 0) {
    fieldError(
      "body",
      `Unsupported raw HTML elements: ${unapproved.join(", ")}.`,
      { tags: unapproved },
    );
  }

  for (const match of prose.matchAll(
    /\b(?:href|src)\s*=\s*["']([^"']*)["']/gi,
  )) {
    const value = match[1].trim();
    if (value.startsWith("javascript:") || value.startsWith("data:")) {
      fieldError("body", "Unsafe URL scheme in raw HTML.");
    }
  }

  const markdownImages = [
    ...body.matchAll(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g),
  ];
  for (const match of markdownImages) {
    const alt = match[1].trim();
    const value = match[2].trim();
    if (alt.length === 0) {
      fieldError(
        "body",
        "Every Markdown image needs alt text. Use a short description of what the image shows.",
      );
    }
    checkImageUrl(value, "body", slug, mode);
  }

  for (const match of prose.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (!src) {
      fieldError("body", "Every raw HTML image needs a src attribute.");
    }
    if (!/\balt\s*=\s*["'][^"']+["']/i.test(tag)) {
      fieldError(
        "body",
        "Every raw HTML image needs a non-empty alt attribute.",
      );
    }
    if (/\bsrcset\s*=/i.test(tag) || /\bbackground\s*=/i.test(tag)) {
      fieldError("body", "srcset and background attributes are not supported.");
    }
    checkImageUrl(src[1].trim(), "body", slug, mode);
  }
}

export function normalizeArticle(
  input: unknown,
  options: NormalizeOptions,
): NormalizedArticle {
  const now = options.now ?? new Date();
  if (!isPlainObject(input)) {
    throw new CmsError(400, "validation_failed", "Article data is required.");
  }
  const rawFrontmatter = input.frontmatter;
  if (!isPlainObject(rawFrontmatter)) {
    throw new CmsError(
      400,
      "validation_failed",
      "Article frontmatter must be an object.",
    );
  }
  const body = input.body;
  if (typeof body !== "string") {
    fieldError("body", "The article body must be text.");
  }

  const warnings: string[] = [];
  for (const key of Object.keys(rawFrontmatter)) {
    if (!KNOWN_FIELDS.has(key)) {
      warnings.push(`Unknown frontmatter field "${key}" was not saved.`);
    }
  }

  const slug = assertSafeSlug(
    readString(rawFrontmatter.slug, "slug", { max: 120 }) as string,
  );
  const title = readString(rawFrontmatter.title, "title", {
    min: 1,
    max: 120,
  }) as string;
  const subtitle = readString(rawFrontmatter.subtitle, "subtitle", {
    max: 160,
    optional: true,
  });
  const description = readString(rawFrontmatter.description, "description", {
    min: 20,
    max: 400,
  }) as string;
  const topics = normalizeTopics(rawFrontmatter.topics);
  const articleType = normalizeArticleType(rawFrontmatter.articleType);
  const references = readReferences(rawFrontmatter.references);

  const technicalContext = readString(
    rawFrontmatter.technicalContext,
    "technicalContext",
    { max: 4000, optional: true },
  );
  const limitations = readString(rawFrontmatter.limitations, "limitations", {
    max: 4000,
    optional: true,
  });

  const publishedAt = readDate(rawFrontmatter.publishedAt, "publishedAt", now);
  const updatedAt = readDate(rawFrontmatter.updatedAt, "updatedAt", now);

  if (options.mode === "publish" && !publishedAt) {
    fieldError("publishedAt", "Published articles need a publication date.");
  }
  if (publishedAt && updatedAt) {
    if (new Date(updatedAt).getTime() < new Date(publishedAt).getTime()) {
      fieldError(
        "updatedAt",
        "The updated date cannot be earlier than the publication date.",
      );
    }
  }

  const coverImage = readString(rawFrontmatter.coverImage, "coverImage", {
    max: 500,
    optional: true,
  });
  const coverAlt = readString(rawFrontmatter.coverAlt, "coverAlt", {
    max: 200,
    optional: true,
  });
  if (coverImage) {
    checkImageUrl(coverImage, "coverImage", slug, options.mode);
    if (!coverAlt) {
      fieldError("coverAlt", "A cover image needs alt text.");
    }
  }
  if (!coverImage && coverAlt) {
    warnings.push("Cover alt text was ignored because no cover image is set.");
  }

  if (rawFrontmatter.status !== undefined) {
    if (
      rawFrontmatter.status !== "draft" &&
      rawFrontmatter.status !== "published"
    ) {
      fieldError("status", "Status must be draft or published.");
    }
    if (
      rawFrontmatter.status !==
      (options.mode === "draft" ? "draft" : "published")
    ) {
      warnings.push(
        "The status field is controlled by the save action and was adjusted.",
      );
    }
  }

  validateMarkdownBody(body, slug, options.mode);

  const frontmatter: ArticleFrontmatter = {
    title,
    slug,
    description,
    status: options.mode === "draft" ? "draft" : "published",
    topics,
    ...(subtitle ? { subtitle } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(articleType ? { articleType } : {}),
    ...(references ? { references } : {}),
    ...(technicalContext ? { technicalContext } : {}),
    ...(limitations ? { limitations } : {}),
    ...(coverImage ? { coverImage } : {}),
    ...(coverAlt && coverImage ? { coverAlt } : {}),
  };

  return {
    frontmatter,
    body: body.replace(/\r\n/g, "\n"),
    warnings,
  };
}

export function normalizeSlugForDisplay(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function summarizeValidationError(error: unknown): string {
  if (error instanceof CmsError) return truncate(error.message, 240);
  return "The article could not be validated.";
}

export function isAllowedImageUrlForSlug(
  value: string,
  slug: string,
  allowDraft: boolean,
): boolean {
  return isAllowedImagePath(value, slug, allowDraft);
}

export function imagePrefixes(): readonly string[] {
  return IMAGE_URL_PREFIXES;
}
