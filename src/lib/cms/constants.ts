export const CMS_BASE = "/r1phun73r";
export const CMS_API = `${CMS_BASE}/api`;

export const CMS_PATHS = {
  articles: "src/content/articles",
  drafts: "drafts",
  archive: "drafts/archive",
  publishedMedia: "public/images",
  draftMedia: "drafts/media",
} as const;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MEDIA_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"] as const;

export const MAX_MARKDOWN_BYTES = 512 * 1024;
export const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
export const MAX_MEDIA_DIMENSION = 8192;
export const MAX_MEDIA_PIXELS = 40_000_000;
export const MAX_MEDIA_PER_UPLOAD = 10;
export const MAX_ARTICLES = 500;
export const MAX_WRITES_PER_MINUTE = 30;
export const CSRF_TTL_MS = 2 * 60 * 60 * 1000;

export const RAW_HTML_ALLOWED_TAGS = [
  "figure",
  "figcaption",
  "a",
  "img",
  "code",
  "kbd",
  "details",
  "summary",
  "span",
  "strong",
  "em",
  "abbr",
] as const;

export const RAW_HTML_FORBIDDEN_TAG_PATTERN =
  /<\s*(script|iframe|object|embed|meta|link|style|form|input|button|textarea|video|audio|source|base)\b/i;
export const RAW_HTML_EVENT_PATTERN = /\son[a-z]+\s*=/i;
export const RAW_HTML_DANGEROUS_URI_PATTERN =
  /(?:href|src|xlink:href)\s*=\s*["']?\s*(?:javascript|vbscript|data)\s*:/i;
export const RAW_HTML_STYLE_PATTERN = /\sstyle\s*=/i;
export const RAW_HTML_SRCDOC_PATTERN = /\ssrcdoc\s*=/i;

export const IMAGE_URL_PREFIXES = ["/images/", `${CMS_BASE}/api/media/draft/`];
