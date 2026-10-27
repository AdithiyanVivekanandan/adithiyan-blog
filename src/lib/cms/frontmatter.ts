import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { CmsError } from "./errors.ts";
import type { ArticleFrontmatter } from "./types.ts";
import { isPlainObject } from "./text.ts";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export interface ParsedMarkdown {
  frontmatter: Record<string, unknown> | null;
  body: string;
}

export function parseMarkdownSource(source: string): ParsedMarkdown {
  const normalized = source.replace(/\r\n/g, "\n");
  const match = FRONTMATTER_PATTERN.exec(normalized);
  if (!match) {
    return { frontmatter: null, body: normalized.replace(/^\n+/, "") };
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(match[1]);
  } catch (error) {
    throw new CmsError(
      400,
      "validation_failed",
      "The YAML frontmatter could not be parsed.",
      {
        details: { reason: error instanceof Error ? error.message : "invalid" },
      },
    );
  }
  if (parsed === null || parsed === undefined) {
    parsed = {};
  }
  if (!isPlainObject(parsed)) {
    throw new CmsError(
      400,
      "validation_failed",
      "The YAML frontmatter must be a mapping of fields.",
    );
  }
  return {
    frontmatter: parsed,
    body: normalized.slice(match[0].length).replace(/^\n+/, ""),
  };
}

export function requireFrontmatter(source: string): ParsedMarkdown {
  const parsed = parseMarkdownSource(source);
  if (!parsed.frontmatter) {
    throw new CmsError(
      400,
      "validation_failed",
      "The article is missing YAML frontmatter.",
    );
  }
  return parsed;
}

export function serializeArticle(
  frontmatter: ArticleFrontmatter,
  body: string,
): string {
  const ordered: Record<string, unknown> = {};
  ordered.title = frontmatter.title;
  if (frontmatter.subtitle) ordered.subtitle = frontmatter.subtitle;
  ordered.slug = frontmatter.slug;
  ordered.description = frontmatter.description;
  if (frontmatter.publishedAt) ordered.publishedAt = frontmatter.publishedAt;
  if (frontmatter.updatedAt) ordered.updatedAt = frontmatter.updatedAt;
  ordered.status = frontmatter.status;
  ordered.topics = frontmatter.topics;
  if (frontmatter.articleType) ordered.articleType = frontmatter.articleType;
  if (frontmatter.coverImage) ordered.coverImage = frontmatter.coverImage;
  if (frontmatter.coverAlt) ordered.coverAlt = frontmatter.coverAlt;
  if (frontmatter.technicalContext) {
    ordered.technicalContext = frontmatter.technicalContext;
  }
  if (frontmatter.limitations) ordered.limitations = frontmatter.limitations;
  if (frontmatter.references?.length) {
    ordered.references = frontmatter.references.map((reference) => {
      const entry: Record<string, unknown> = {
        title: reference.title,
        url: reference.url,
      };
      if (reference.annotation) entry.annotation = reference.annotation;
      return entry;
    });
  }
  if (frontmatter.cmsUpdatedAt) ordered.cmsUpdatedAt = frontmatter.cmsUpdatedAt;
  if (frontmatter.cmsArchivedAt) {
    ordered.cmsArchivedAt = frontmatter.cmsArchivedAt;
  }

  let yamlSource: string;
  try {
    yamlSource = stringifyYaml(ordered, { lineWidth: 0 }).replace(/\n+$/, "");
  } catch (error) {
    throw new CmsError(
      400,
      "validation_failed",
      "The frontmatter could not be serialized.",
      {
        details: { reason: error instanceof Error ? error.message : "invalid" },
      },
    );
  }

  const normalizedBody = body.replace(/\r\n/g, "\n").replace(/^\n+/, "");
  return `---\n${yamlSource}\n---\n\n${normalizedBody}`;
}
