import { APPROVED_TOPICS, type TopicSlug } from "../topics.ts";
import { ARTICLE_TYPES, type ArticleType } from "../article-type.ts";
import {
  CMS_BASE,
  CMS_PATHS,
  MAX_ARTICLES,
  MAX_MARKDOWN_BYTES,
} from "./constants.ts";
import { CmsError } from "./errors.ts";
import { parseMarkdownSource, serializeArticle } from "./frontmatter.ts";
import { normalizeArticle, validateMarkdownBody } from "./validation.ts";
import { computeGitBlobSha } from "./github.ts";
import {
  extractDraftMediaFilenames,
  inspectImage,
  isSupportedExtension,
  mediaPath,
  mediaUrl,
  replaceDraftMediaUrls,
  toMediaInfo,
  validateAltText,
  validateCaption,
  validateMediaFile,
} from "./media.ts";
import type {
  ArticleDetail,
  ArticleDocument,
  ArticleFrontmatter,
  ArticleLocation,
  ArticleReference,
  ArticleSummary,
  DeleteResult,
  FileChange,
  GitHubGateway,
  ImportResult,
  MediaInfo,
  MediaListResult,
  MediaUploadResult,
  SaveArticleRequest,
  SaveArticleResult,
} from "./types.ts";
import {
  assertSafeRelativePath,
  assertSafeSlug,
  isPlainObject,
  joinRepoPath,
  mapLimit,
  parseIsoDate,
  slugifyTitle,
  truncate,
} from "./text.ts";

type Group = Partial<Record<ArticleLocation, IndexEntry>>;

interface IndexEntry {
  slug: string;
  location: ArticleLocation;
  path: string;
  name: string;
  sha: string;
  size: number;
  source: string;
  frontmatter: ArticleFrontmatter;
  body: string;
  warnings: string[];
}

export interface MediaUploadInput {
  filename: string;
  bytes: Uint8Array;
  alt: string;
  caption?: string;
  scope: "draft" | "published";
  slug: string;
  replacePath?: string;
  confirmReplace?: boolean;
}

const LOCATION_DIRS: readonly { location: ArticleLocation; dir: string }[] = [
  { location: "published", dir: CMS_PATHS.articles },
  { location: "draft", dir: CMS_PATHS.drafts },
  { location: "archived", dir: CMS_PATHS.archive },
];

const ALLOWED_LOCATIONS = new Set<ArticleLocation>([
  "published",
  "draft",
  "archived",
]);

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function isoValue(value: unknown): string | undefined {
  if (typeof value !== "string" && !(value instanceof Date)) return undefined;
  try {
    return parseIsoDate(value, "date").toISOString();
  } catch {
    return undefined;
  }
}

function coerceTopics(value: unknown): {
  topics: TopicSlug[];
  warnings: string[];
} {
  const warnings: string[] = [];
  if (!Array.isArray(value)) {
    return { topics: [], warnings };
  }
  const topics: TopicSlug[] = [];
  for (const topic of value) {
    if (
      typeof topic === "string" &&
      (APPROVED_TOPICS as readonly string[]).includes(topic)
    ) {
      if (!topics.includes(topic as TopicSlug)) {
        topics.push(topic as TopicSlug);
      }
    } else {
      warnings.push(
        `Unknown topic "${String(topic)}" is not part of the taxonomy.`,
      );
    }
  }
  return { topics, warnings };
}

function coerceReferences(value: unknown): {
  references: ArticleReference[] | undefined;
  warnings: string[];
} {
  if (value === undefined) return { references: undefined, warnings: [] };
  if (!Array.isArray(value)) {
    return {
      references: undefined,
      warnings: [
        "The references field is not a list and will be ignored on save.",
      ],
    };
  }
  const warnings: string[] = [];
  const references: ArticleReference[] = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) {
      warnings.push("A reference entry is not an object and will be ignored.");
      continue;
    }
    const title = textValue(entry.title);
    const url = textValue(entry.url);
    if (!title || !url) {
      warnings.push(
        "A reference is missing a title or URL and will be ignored.",
      );
      continue;
    }
    const annotation = textValue(entry.annotation);
    references.push({ title, url, ...(annotation ? { annotation } : {}) });
  }
  return {
    references: references.length > 0 ? references : undefined,
    warnings,
  };
}

function coerceFrontmatter(
  raw: Record<string, unknown>,
  fallbackSlug: string,
  location: ArticleLocation,
): { frontmatter: ArticleFrontmatter; warnings: string[] } {
  const warnings: string[] = [];
  const slug = textValue(raw.slug) ?? fallbackSlug;
  if (textValue(raw.slug) && textValue(raw.slug) !== fallbackSlug) {
    warnings.push(
      `This file is named "${fallbackSlug}.md" but declares slug "${slug}". The CMS follows the declared slug.`,
    );
  }
  if (slug !== fallbackSlug && !textValue(raw.slug)) {
    warnings.push(
      "The filename and slug differ. Saving from the CMS keeps the existing file path.",
    );
  }
  const status: "draft" | "published" =
    raw.status === "published" || raw.status === "draft"
      ? raw.status
      : location === "published"
        ? "published"
        : "draft";
  if (location === "published" && status === "draft") {
    warnings.push(
      "This file is in the published directory but is marked draft, so it is not live.",
    );
  }
  if (location !== "published" && status === "published") {
    warnings.push(
      "This file is marked published but is outside the content directory, so it is not live.",
    );
  }

  const publishedAt = isoValue(raw.publishedAt);
  if (raw.publishedAt !== undefined && !publishedAt) {
    warnings.push("The publishedAt value is not a valid date.");
  }
  const updatedAt = isoValue(raw.updatedAt);
  if (raw.updatedAt !== undefined && !updatedAt) {
    warnings.push("The updatedAt value is not a valid date.");
  }
  if (
    publishedAt &&
    updatedAt &&
    new Date(updatedAt).getTime() < new Date(publishedAt).getTime()
  ) {
    warnings.push("The updated date is earlier than the publication date.");
  }

  const topics = coerceTopics(raw.topics);
  warnings.push(...topics.warnings);
  const references = coerceReferences(raw.references);
  warnings.push(...references.warnings);

  const articleType =
    typeof raw.articleType === "string" &&
    (ARTICLE_TYPES as readonly string[]).includes(raw.articleType)
      ? (raw.articleType as ArticleType)
      : undefined;
  if (raw.articleType !== undefined && !articleType) {
    warnings.push(`Unknown article type "${String(raw.articleType)}".`);
  }

  const cmsUpdatedAt = isoValue(raw.cmsUpdatedAt);
  const cmsArchivedAt = isoValue(raw.cmsArchivedAt);
  const coverImage = textValue(raw.coverImage);
  const coverAlt = textValue(raw.coverAlt);
  if (coverImage && !coverAlt) {
    warnings.push("The cover image has no alt text.");
  }

  return {
    frontmatter: {
      title: textValue(raw.title) ?? fallbackSlug,
      slug,
      description: textValue(raw.description) ?? "",
      status,
      topics: topics.topics,
      ...(textValue(raw.subtitle) ? { subtitle: textValue(raw.subtitle) } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
      ...(articleType ? { articleType } : {}),
      ...(references.references ? { references: references.references } : {}),
      ...(textValue(raw.technicalContext)
        ? { technicalContext: textValue(raw.technicalContext) }
        : {}),
      ...(textValue(raw.limitations)
        ? { limitations: textValue(raw.limitations) }
        : {}),
      ...(coverImage ? { coverImage } : {}),
      ...(coverAlt ? { coverAlt } : {}),
      ...(cmsUpdatedAt ? { cmsUpdatedAt } : {}),
      ...(cmsArchivedAt ? { cmsArchivedAt } : {}),
    },
    warnings,
  };
}

function entriesOf(group: Group | undefined): IndexEntry[] {
  if (!group) return [];
  return [group.published, group.draft, group.archived].filter(
    (entry): entry is IndexEntry => entry !== undefined,
  );
}

function entryFor(
  group: Group | undefined,
  location: ArticleLocation,
): IndexEntry | undefined {
  return group?.[location];
}

function timestampOf(summary: ArticleSummary): string {
  return (
    summary.cmsUpdatedAt ??
    summary.updatedAt ??
    summary.publishedAt ??
    summary.cmsArchivedAt ??
    ""
  );
}

function stateRank(state: ArticleSummary["state"]): number {
  if (state === "draft" || state === "published-with-draft") return 0;
  if (state === "published") return 1;
  return 2;
}

function contentSignature(
  frontmatter: ArticleFrontmatter,
  body: string,
): string {
  return JSON.stringify({
    title: frontmatter.title,
    subtitle: frontmatter.subtitle ?? "",
    slug: frontmatter.slug,
    description: frontmatter.description,
    topics: [...frontmatter.topics].sort(),
    articleType: frontmatter.articleType ?? "",
    references: frontmatter.references ?? [],
    technicalContext: frontmatter.technicalContext ?? "",
    limitations: frontmatter.limitations ?? "",
    coverImage: frontmatter.coverImage ?? "",
    coverAlt: frontmatter.coverAlt ?? "",
  }).concat("\n", body.replace(/\r\n/g, "\n").replace(/\s+$/, ""));
}

function filenameStem(path: string): string {
  const name = path.split("/").pop() ?? "";
  return name.replace(/\.md$/i, "");
}

function requireLocation(value: unknown): ArticleLocation {
  if (
    typeof value !== "string" ||
    !ALLOWED_LOCATIONS.has(value as ArticleLocation)
  ) {
    throw new CmsError(400, "bad_request", "Unknown article location.");
  }
  return value as ArticleLocation;
}

export class ArticleService {
  private readonly github: GitHubGateway;
  private readonly now: () => Date;
  private readonly repoPrivateConfirmed: boolean;

  constructor(options: {
    github: GitHubGateway;
    now?: () => Date;
    repoPrivateConfirmed: boolean;
  }) {
    this.github = options.github;
    this.now = options.now ?? (() => new Date());
    this.repoPrivateConfirmed = options.repoPrivateConfirmed;
  }

  private assertDraftWritesAllowed(): void {
    if (!this.repoPrivateConfirmed) {
      throw new CmsError(
        503,
        "not_configured",
        "Draft saving and draft media are locked because the repository is not confirmed private. Make the GitHub repository private, then set CMS_REPO_PRIVATE_CONFIRMED=true.",
      );
    }
  }

  private async loadIndex(): Promise<Map<string, Group>> {
    const groups = new Map<string, Group>();
    let total = 0;

    for (const { location, dir } of LOCATION_DIRS) {
      const directoryEntries = (await this.github.list(dir)).filter(
        (entry) => entry.type === "file" && entry.name.endsWith(".md"),
      );
      total += directoryEntries.length;
      if (total > MAX_ARTICLES) {
        throw new CmsError(
          400,
          "validation_failed",
          `The repository has more than ${MAX_ARTICLES} article files. Use the repository directly for bulk changes.`,
        );
      }

      const files = await mapLimit(directoryEntries, 4, async (entry) => {
        const file = await this.github.getText(entry.path);
        return file ? { entry, file } : null;
      });

      for (const item of files) {
        if (!item) continue;
        const { entry, file } = item;
        const fallbackSlug = filenameStem(entry.path);
        const warnings: string[] = [];
        let raw: Record<string, unknown>;
        let body = "";
        try {
          const parsed = parseMarkdownSource(file.content);
          body = parsed.body;
          if (parsed.frontmatter) {
            raw = parsed.frontmatter;
          } else {
            warnings.push(
              "This file has no YAML frontmatter. Add frontmatter in GitHub before editing it here.",
            );
            raw = {
              title: fallbackSlug,
              slug: fallbackSlug,
              description: "This file has no frontmatter.",
              status: location === "published" ? "published" : "draft",
              topics: [],
            };
          }
        } catch (error) {
          warnings.push(
            `Frontmatter could not be parsed${error instanceof Error ? `: ${error.message}` : ""}. Fix it in GitHub before editing here.`,
          );
          raw = {
            title: fallbackSlug,
            slug: fallbackSlug,
            description: "This file has invalid frontmatter.",
            status: location === "published" ? "published" : "draft",
            topics: [],
          };
        }

        const coerced = coerceFrontmatter(raw, fallbackSlug, location);
        warnings.push(...coerced.warnings);
        const slug = coerced.frontmatter.slug;
        const group = groups.get(slug) ?? {};
        if (group[location]) {
          throw new CmsError(
            409,
            "conflict",
            `Two files under ${dir} declare the slug "${slug}". Make article slugs unique before using the CMS.`,
            {
              details: {
                slug,
                paths: [group[location]?.path, entry.path],
              },
            },
          );
        }
        group[location] = {
          slug,
          location,
          path: entry.path,
          name: entry.name,
          sha: file.sha,
          size: entry.size,
          source: file.content,
          frontmatter: coerced.frontmatter,
          body,
          warnings,
        };
        groups.set(slug, group);
      }
    }
    return groups;
  }

  private summaryOf(slug: string, group: Group): ArticleSummary {
    const draft = group.draft;
    const published = group.published;
    const archived = group.archived;
    const preferred = draft ?? published ?? archived;
    if (!preferred) {
      throw new CmsError(500, "internal_error", "Empty article group.");
    }
    const livePublished =
      published?.frontmatter.status === "published" &&
      Boolean(published.frontmatter.publishedAt);
    const state: ArticleSummary["state"] = draft
      ? livePublished
        ? "published-with-draft"
        : "draft"
      : livePublished
        ? "published"
        : published
          ? "draft"
          : "archived";
    const locations: ArticleSummary["locations"] = {};
    for (const entry of entriesOf(group)) {
      locations[entry.location] = {
        sha: entry.sha,
        path: entry.path,
        ...((entry.frontmatter.updatedAt ?? entry.frontmatter.publishedAt)
          ? {
              updatedAt:
                entry.frontmatter.updatedAt ?? entry.frontmatter.publishedAt,
            }
          : entry.frontmatter.cmsUpdatedAt
            ? { updatedAt: entry.frontmatter.cmsUpdatedAt }
            : entry.frontmatter.cmsArchivedAt
              ? { updatedAt: entry.frontmatter.cmsArchivedAt }
              : {}),
      };
    }
    const warnings = [
      ...new Set(entriesOf(group).flatMap((entry) => entry.warnings)),
    ];
    return {
      slug,
      title: preferred.frontmatter.title,
      description: preferred.frontmatter.description,
      state,
      topics: preferred.frontmatter.topics,
      articleType: preferred.frontmatter.articleType,
      publishedAt: preferred.frontmatter.publishedAt,
      updatedAt: preferred.frontmatter.updatedAt,
      cmsUpdatedAt: draft?.frontmatter.cmsUpdatedAt,
      cmsArchivedAt: archived?.frontmatter.cmsArchivedAt,
      locations,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async list(): Promise<ArticleSummary[]> {
    const groups = await this.loadIndex();
    return [...groups.entries()]
      .map(([slug, group]) => this.summaryOf(slug, group))
      .sort((a, b) => {
        const rank = stateRank(a.state) - stateRank(b.state);
        if (rank !== 0) return rank;
        return (
          timestampOf(b).localeCompare(timestampOf(a)) ||
          a.slug.localeCompare(b.slug)
        );
      });
  }

  private documentFromEntry(entry: IndexEntry): ArticleDocument {
    return {
      frontmatter: entry.frontmatter,
      body: entry.body,
      location: entry.location,
      path: entry.path,
      sha: entry.sha,
      warnings: entry.warnings,
    };
  }

  private detailFromGroup(
    group: Group,
    requested?: ArticleLocation,
  ): ArticleDetail {
    let location = requested;
    if (location) {
      if (!group[location]) {
        throw new CmsError(
          404,
          "not_found",
          "That article version was not found.",
        );
      }
    } else {
      location = group.draft
        ? "draft"
        : group.published
          ? "published"
          : "archived";
    }
    const entry = group[location];
    if (!entry) {
      throw new CmsError(404, "not_found", "That article was not found.");
    }
    const locations: ArticleDetail["locations"] = {};
    for (const candidate of entriesOf(group)) {
      locations[candidate.location] = {
        sha: candidate.sha,
        path: candidate.path,
        ...((candidate.frontmatter.updatedAt ??
        candidate.frontmatter.publishedAt)
          ? {
              updatedAt:
                candidate.frontmatter.updatedAt ??
                candidate.frontmatter.publishedAt,
            }
          : candidate.frontmatter.cmsUpdatedAt
            ? { updatedAt: candidate.frontmatter.cmsUpdatedAt }
            : candidate.frontmatter.cmsArchivedAt
              ? { updatedAt: candidate.frontmatter.cmsArchivedAt }
              : {}),
      };
    }
    return {
      document: this.documentFromEntry(entry),
      locations,
      availableLocations: entriesOf(group).map((item) => item.location),
    };
  }

  async get(slug: string, location?: ArticleLocation): Promise<ArticleDetail> {
    const safeSlug = assertSafeSlug(slug);
    const groups = await this.loadIndex();
    const group = groups.get(safeSlug);
    if (!group) {
      throw new CmsError(404, "not_found", "That article was not found.");
    }
    return this.detailFromGroup(group, location);
  }

  private findPathOwner(
    groups: Map<string, Group>,
    path: string,
  ): IndexEntry | undefined {
    for (const group of groups.values()) {
      for (const entry of entriesOf(group)) {
        if (entry.path === path) return entry;
      }
    }
    return undefined;
  }

  private assertPathAvailable(
    groups: Map<string, Group>,
    path: string,
    slug: string,
  ): void {
    const owner = this.findPathOwner(groups, path);
    if (owner && owner.slug !== slug) {
      throw new CmsError(
        409,
        "conflict",
        `The file ${path} belongs to the article "${owner.slug}". Choose a different slug.`,
        { details: { path, owner: owner.slug } },
      );
    }
  }

  private async readDocumentAt(
    path: string,
    location: ArticleLocation,
    fallback: ArticleDocument,
  ): Promise<ArticleDocument> {
    const file = await this.github.getText(path);
    if (!file) {
      return {
        ...fallback,
        sha: "",
        warnings: [
          ...fallback.warnings,
          "The change was saved, but the new file SHA could not be read. Reload the article.",
        ],
      };
    }
    try {
      const parsed = parseMarkdownSource(file.content);
      const coerced = coerceFrontmatter(
        parsed.frontmatter ?? {},
        filenameStem(path),
        location,
      );
      return {
        frontmatter: coerced.frontmatter,
        body: parsed.body,
        location,
        path,
        sha: file.sha,
        warnings: coerced.warnings,
      };
    } catch {
      return {
        ...fallback,
        path,
        sha: file.sha,
        warnings: [
          ...fallback.warnings,
          "The change was saved, but the file could not be re-read cleanly. Reload the article.",
        ],
      };
    }
  }

  private async copyDraftMediaForPublish(
    slug: string,
    body: string,
    coverImage: string | undefined,
  ): Promise<{
    body: string;
    coverImage?: string;
    changes: FileChange[];
    copied: string[];
    used: string[];
  }> {
    const draftFiles = new Set(extractDraftMediaFilenames(body, slug));
    if (coverImage?.startsWith(`${CMS_BASE}/api/media/draft/${slug}/`)) {
      const filename = coverImage.split("/").pop();
      if (filename) draftFiles.add(filename);
    }
    if (draftFiles.size === 0) {
      return { body, coverImage, changes: [], copied: [], used: [] };
    }

    const draftDir = joinRepoPath(CMS_PATHS.draftMedia, slug);
    const publishedDir = joinRepoPath(CMS_PATHS.publishedMedia, slug);
    const draftEntries = (await this.github.list(draftDir)).filter(
      (entry) => entry.type === "file" && isSupportedExtension(entry.name),
    );
    const publishedEntries = (await this.github.list(publishedDir)).filter(
      (entry) => entry.type === "file" && isSupportedExtension(entry.name),
    );
    const draftMap = new Map(draftEntries.map((entry) => [entry.name, entry]));
    const publishedMap = new Map(
      publishedEntries.map((entry) => [entry.name, entry]),
    );

    const mapping = new Map<string, string>();
    const changes: FileChange[] = [];
    const copied: string[] = [];

    for (const filename of draftFiles) {
      if (!/^[a-z0-9][a-z0-9._-]*$/.test(filename)) {
        throw new CmsError(
          400,
          "validation_failed",
          `The draft media reference "${filename}" has an unsafe filename.`,
        );
      }
      const draftEntry = draftMap.get(filename);
      if (!draftEntry) {
        throw new CmsError(
          400,
          "validation_failed",
          `The draft media file "${filename}" is missing. Re-upload it or remove the reference.`,
        );
      }
      const raw = await this.github.getRaw(draftEntry.path);
      if (!raw) {
        throw new CmsError(
          400,
          "validation_failed",
          `The draft media file "${filename}" could not be read.`,
        );
      }
      const blobSha = await computeGitBlobSha(raw.bytes);
      if (blobSha !== draftEntry.sha) {
        throw new CmsError(
          409,
          "conflict",
          `The draft media file "${filename}" changed while publishing. Reload and try again.`,
        );
      }
      inspectImage(raw.bytes);

      let destination = filename;
      let needsCopy = true;
      const existing = publishedMap.get(filename);
      if (existing) {
        if (existing.sha === draftEntry.sha) {
          needsCopy = false;
        } else {
          const extension = filename.split(".").pop() as string;
          const stem = filename.slice(0, -(extension.length + 1));
          destination = `${stem}-${draftEntry.sha.slice(0, 8)}.${extension}`;
          const second = publishedMap.get(destination);
          if (second && second.sha !== draftEntry.sha) {
            destination = `${stem}-${draftEntry.sha.slice(0, 12)}.${extension}`;
          }
          const target = publishedMap.get(destination);
          needsCopy = !target || target.sha !== draftEntry.sha;
        }
      }

      mapping.set(filename, mediaUrl("published", slug, destination));
      if (needsCopy) {
        changes.push({
          path: mediaPath("published", slug, destination),
          content: raw.bytes,
          expectedSha: publishedMap.get(destination)?.sha ?? null,
        });
        copied.push(mediaUrl("published", slug, destination));
      }
    }

    const rewrittenBody = replaceDraftMediaUrls(body, slug, mapping);
    let rewrittenCover = coverImage;
    if (coverImage?.startsWith(`${CMS_BASE}/api/media/draft/${slug}/`)) {
      const filename = coverImage.split("/").pop() ?? "";
      rewrittenCover = mapping.get(filename);
    }
    return {
      body: rewrittenBody,
      coverImage: rewrittenCover,
      changes,
      copied,
      used: [...draftFiles],
    };
  }

  async save(input: SaveArticleRequest): Promise<SaveArticleResult> {
    if (input.mode !== "draft" && input.mode !== "publish") {
      throw new CmsError(400, "bad_request", "Unknown save mode.");
    }
    if (!isPlainObject(input.frontmatter)) {
      throw new CmsError(400, "validation_failed", "Frontmatter is required.");
    }
    const requestedSlug = textValue(input.frontmatter.slug);
    if (!requestedSlug) {
      throw new CmsError(400, "validation_failed", "A slug is required.");
    }
    if (input.mode === "draft") {
      this.assertDraftWritesAllowed();
    }

    const groups = await this.loadIndex();
    const existing = groups.get(requestedSlug);
    const now = this.now();
    const nowIso = now.toISOString();

    if (input.mode === "draft") {
      const normalized = normalizeArticle(
        { frontmatter: input.frontmatter, body: input.body },
        { mode: "draft", now },
      );
      const frontmatter: ArticleFrontmatter = {
        ...normalized.frontmatter,
        cmsUpdatedAt: nowIso,
      };
      const content = serializeArticle(frontmatter, normalized.body);
      const draftEntry = existing?.draft;
      const path =
        draftEntry?.path ??
        joinRepoPath(CMS_PATHS.drafts, `${normalized.frontmatter.slug}.md`);
      this.assertPathAvailable(groups, path, normalized.frontmatter.slug);

      const clientSha =
        input.expectedDraftSha !== undefined
          ? input.expectedDraftSha
          : input.expectedSha;
      if (draftEntry && typeof clientSha !== "string") {
        throw new CmsError(
          409,
          "conflict",
          "This draft changed since you opened it. Reload it before saving.",
        );
      }
      const expectedSha = clientSha === undefined ? null : clientSha;

      const commit = await this.github.commit(
        [{ path, content, expectedSha }],
        `cms: save draft "${normalized.frontmatter.slug}"`,
      );
      const fallback: ArticleDocument = {
        frontmatter,
        body: normalized.body,
        location: "draft",
        path,
        sha: "",
        warnings: normalized.warnings,
      };
      const document = await this.readDocumentAt(path, "draft", fallback);
      return {
        commit,
        document,
        draftRemoved: false,
        mediaCopied: [],
        warnings: [
          ...normalized.warnings,
          ...(commit.changed.length === 0
            ? ["There were no draft changes to save."]
            : []),
        ],
        deployment: null,
      };
    }

    const publishedEntry = existing?.published;
    const draftEntry = existing?.draft;
    const archiveEntry = existing?.archived;

    const rawCover = textValue(input.frontmatter.coverImage);
    const media = await this.copyDraftMediaForPublish(
      requestedSlug,
      input.body,
      rawCover,
    );

    const publishedBase =
      textValue(input.frontmatter.publishedAt) ??
      publishedEntry?.frontmatter.publishedAt ??
      nowIso;
    const rawUpdated = textValue(input.frontmatter.updatedAt);
    const rawForPublish: Record<string, unknown> = {
      ...input.frontmatter,
      publishedAt: publishedBase,
      coverImage: media.coverImage,
      status: "published",
    };
    if (rawUpdated) {
      rawForPublish.updatedAt = rawUpdated;
    } else {
      delete rawForPublish.updatedAt;
    }

    const first = normalizeArticle(
      { frontmatter: rawForPublish, body: media.body },
      { mode: "publish", now },
    );

    let finalUpdatedAt = first.frontmatter.updatedAt;
    if (!finalUpdatedAt) {
      if (publishedEntry) {
        const changed =
          contentSignature(first.frontmatter, media.body) !==
          contentSignature(publishedEntry.frontmatter, publishedEntry.body);
        finalUpdatedAt = changed
          ? nowIso
          : publishedEntry.frontmatter.updatedAt;
      }
    }

    const finalRaw: Record<string, unknown> = {
      ...rawForPublish,
      publishedAt: first.frontmatter.publishedAt,
    };
    if (finalUpdatedAt) {
      finalRaw.updatedAt = finalUpdatedAt;
    } else {
      delete finalRaw.updatedAt;
    }
    const final = normalizeArticle(
      { frontmatter: finalRaw, body: media.body },
      { mode: "publish", now },
    );
    const content = serializeArticle(final.frontmatter, final.body);
    const path =
      publishedEntry?.path ??
      joinRepoPath(CMS_PATHS.articles, `${final.frontmatter.slug}.md`);
    this.assertPathAvailable(groups, path, final.frontmatter.slug);

    const clientPublishedSha =
      input.expectedPublishedSha !== undefined
        ? input.expectedPublishedSha
        : input.expectedSha;
    if (publishedEntry && typeof clientPublishedSha !== "string") {
      throw new CmsError(
        409,
        "conflict",
        "This published article changed since you opened it. Reload it before publishing.",
      );
    }
    const publishedExpected =
      clientPublishedSha === undefined ? null : clientPublishedSha;

    const changes: FileChange[] = [
      ...media.changes,
      { path, content, expectedSha: publishedExpected },
    ];

    if (draftEntry) {
      if (typeof input.expectedDraftSha !== "string") {
        throw new CmsError(
          409,
          "conflict",
          "There are draft changes for this article. Reload before publishing so those changes are not lost.",
        );
      }
      changes.push({
        path: draftEntry.path,
        delete: true,
        expectedSha: input.expectedDraftSha,
      });
    }

    const commit = await this.github.commit(
      changes,
      publishedEntry
        ? `cms: update "${final.frontmatter.slug}"`
        : `cms: publish "${final.frontmatter.slug}"`,
    );

    const fallback: ArticleDocument = {
      frontmatter: final.frontmatter,
      body: final.body,
      location: "published",
      path,
      sha: "",
      warnings: final.warnings,
    };
    const document = await this.readDocumentAt(path, "published", fallback);
    const warnings = [...final.warnings];
    if (archiveEntry) {
      warnings.push(
        "An archived copy still exists under drafts/archive/. Delete it when you no longer need it.",
      );
    }
    if (media.used.length > 0) {
      warnings.push(
        "The staged draft media files still exist. Delete them from the draft media library when convenient.",
      );
    }
    if (commit.changed.length === 0) {
      warnings.push("There were no changes to publish.");
    }

    return {
      commit,
      document,
      draftRemoved: Boolean(draftEntry),
      mediaCopied: media.copied,
      warnings,
      deployment: null,
    };
  }

  async archive(
    slug: string,
    expectedSha: string,
    confirmSlug: string,
  ): Promise<DeleteResult> {
    const safeSlug = assertSafeSlug(slug);
    if (confirmSlug !== safeSlug) {
      throw new CmsError(
        400,
        "validation_failed",
        "Type the slug exactly to archive this article.",
      );
    }
    if (!expectedSha) {
      throw new CmsError(
        409,
        "conflict",
        "Reload the article before archiving it.",
      );
    }
    const groups = await this.loadIndex();
    const group = groups.get(safeSlug);
    const publishedEntry = group?.published;
    if (!publishedEntry) {
      throw new CmsError(
        404,
        "not_found",
        "That published article was not found.",
      );
    }
    if (group?.archived) {
      throw new CmsError(
        409,
        "conflict",
        "An archived copy already exists. Delete or restore it before archiving again.",
      );
    }
    const nowIso = this.now().toISOString();
    const frontmatter: ArticleFrontmatter = {
      ...publishedEntry.frontmatter,
      status: "draft",
      cmsArchivedAt: nowIso,
      cmsUpdatedAt: nowIso,
    };
    const path = joinRepoPath(CMS_PATHS.archive, `${safeSlug}.md`);
    this.assertPathAvailable(groups, path, safeSlug);
    const content = serializeArticle(frontmatter, publishedEntry.body);
    const commit = await this.github.commit(
      [
        { path, content, expectedSha: null },
        { path: publishedEntry.path, delete: true, expectedSha },
      ],
      `cms: archive "${safeSlug}"`,
    );
    const warnings: string[] = [];
    if (group?.draft) {
      warnings.push(
        "The working draft was left in drafts/. Delete it if you do not want to republish this article.",
      );
    }
    return { commit, warnings };
  }

  async delete(
    slug: string,
    location: ArticleLocation,
    expectedSha: string,
    confirmSlug: string,
  ): Promise<DeleteResult> {
    const safeSlug = assertSafeSlug(slug);
    const where = requireLocation(location);
    if (confirmSlug !== safeSlug) {
      throw new CmsError(
        400,
        "validation_failed",
        "Type the slug exactly to delete this file.",
      );
    }
    if (!expectedSha) {
      throw new CmsError(
        409,
        "conflict",
        "Reload the article before deleting it.",
      );
    }
    const groups = await this.loadIndex();
    const group = groups.get(safeSlug);
    const entry = entryFor(group, where);
    if (!entry) {
      throw new CmsError(404, "not_found", "That article file was not found.");
    }
    const commit = await this.github.commit(
      [{ path: entry.path, delete: true, expectedSha }],
      `cms: delete ${where} "${safeSlug}"`,
    );
    const warnings: string[] = [];
    if (where === "published" && group?.draft) {
      warnings.push("The working draft in drafts/ was not deleted.");
    }
    if (where === "draft" && group?.published) {
      warnings.push("The published article was not deleted and remains live.");
    }
    return { commit, warnings };
  }

  async exportMarkdown(
    slug: string,
    location?: ArticleLocation,
  ): Promise<{ filename: string; source: string }> {
    const safeSlug = assertSafeSlug(slug);
    const groups = await this.loadIndex();
    const group = groups.get(safeSlug);
    if (!group) {
      throw new CmsError(404, "not_found", "That article was not found.");
    }
    const chosen =
      location ??
      (group.draft ? "draft" : group.published ? "published" : "archived");
    const entry = entryFor(group, chosen);
    if (!entry) {
      throw new CmsError(
        404,
        "not_found",
        "That article version was not found.",
      );
    }
    return { filename: `${safeSlug}.md`, source: entry.source };
  }

  async importMarkdown(source: unknown): Promise<ImportResult> {
    if (typeof source !== "string" || source.trim().length === 0) {
      throw new CmsError(
        400,
        "validation_failed",
        "Paste or upload Markdown first.",
      );
    }
    if (new TextEncoder().encode(source).length > MAX_MARKDOWN_BYTES) {
      throw new CmsError(
        413,
        "payload_too_large",
        "The imported Markdown is larger than 512 KB.",
      );
    }
    const parsed = parseMarkdownSource(source);
    const warnings: string[] = [];
    const body = parsed.body;
    const h1 = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
    const paragraph =
      /^(?!#|!\[|<|[-*+]\s|>\s|\d+\.\s)(.{20,})$/m.exec(body)?.[1]?.trim() ??
      "";
    const fallbackTitle = h1 ?? "Imported article";
    const fallbackSlug = slugifyTitle(fallbackTitle) || "imported-article";
    const fallbackDescription =
      paragraph.length >= 20
        ? paragraph.slice(0, 400)
        : "Imported draft. Update the description before publishing.";

    if (parsed.frontmatter) {
      const coerced = coerceFrontmatter(
        parsed.frontmatter,
        fallbackSlug,
        "draft",
      );
      warnings.push(...coerced.warnings);
      const fm = coerced.frontmatter;
      if (!textValue(parsed.frontmatter.title)) {
        fm.title = fallbackTitle;
        warnings.push("No title was found; used the first heading.");
      }
      if (!textValue(parsed.frontmatter.slug)) {
        fm.slug = fallbackSlug;
        warnings.push("No slug was found; suggested one from the title.");
      }
      if (!textValue(parsed.frontmatter.description)) {
        fm.description = fallbackDescription;
        warnings.push("No description was found; suggested one from the body.");
      } else if (fm.description.length < 20) {
        warnings.push("The description must be at least 20 characters.");
      }
      if (fm.topics.length === 0) {
        warnings.push("Choose at least one topic before saving.");
      }
      fm.status = "draft";
      try {
        validateMarkdownBody(body, fm.slug, "draft");
      } catch (error) {
        warnings.push(
          error instanceof Error
            ? `The body needs attention before saving: ${truncate(error.message, 240)}`
            : "The body needs attention before saving.",
        );
      }
      return { frontmatter: fm, body, warnings };
    }

    warnings.push(
      "No frontmatter was found. Review the title, slug, description and topics.",
    );
    try {
      validateMarkdownBody(body, fallbackSlug, "draft");
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `The body needs attention before saving: ${truncate(error.message, 240)}`
          : "The body needs attention before saving.",
      );
    }
    return {
      frontmatter: {
        title: fallbackTitle,
        slug: fallbackSlug,
        description: fallbackDescription,
        status: "draft",
        topics: [],
      },
      body,
      warnings,
    };
  }

  async listMedia(
    slug: string,
    scope: "draft" | "published",
  ): Promise<MediaListResult> {
    if (scope !== "draft" && scope !== "published") {
      throw new CmsError(400, "bad_request", "Unknown media scope.");
    }
    const safeSlug = assertSafeSlug(slug);
    const dir =
      scope === "draft"
        ? joinRepoPath(CMS_PATHS.draftMedia, safeSlug)
        : joinRepoPath(CMS_PATHS.publishedMedia, safeSlug);
    const entries = (await this.github.list(dir)).filter(
      (entry) => entry.type === "file" && isSupportedExtension(entry.name),
    );
    if (entries.length > 200) {
      throw new CmsError(
        400,
        "validation_failed",
        "This media library has more than 200 files. Manage it in GitHub.",
      );
    }
    const warnings: string[] = [];
    const media = (
      await mapLimit(entries, 4, async (entry): Promise<MediaInfo> => {
        try {
          const raw = await this.github.getRaw(entry.path);
          if (!raw) {
            warnings.push(`${entry.name} could not be read.`);
            return toMediaInfo(
              scope,
              safeSlug,
              entry.name,
              entry.size,
              entry.sha,
            );
          }
          const details = inspectImage(raw.bytes);
          return toMediaInfo(
            scope,
            safeSlug,
            entry.name,
            entry.size,
            entry.sha,
            {
              width: details.width,
              height: details.height,
            },
          );
        } catch (error) {
          warnings.push(
            `${entry.name}: ${error instanceof Error ? error.message : "invalid image"}`,
          );
          return toMediaInfo(
            scope,
            safeSlug,
            entry.name,
            entry.size,
            entry.sha,
          );
        }
      })
    ).sort((a, b) => a.filename.localeCompare(b.filename));
    return { media, warnings };
  }

  async uploadMedia(input: MediaUploadInput): Promise<MediaUploadResult> {
    if (input.scope !== "draft" && input.scope !== "published") {
      throw new CmsError(400, "bad_request", "Unknown media scope.");
    }
    const safeSlug = assertSafeSlug(input.slug);
    validateAltText(input.alt);
    validateCaption(input.caption);
    if (input.scope === "draft") {
      this.assertDraftWritesAllowed();
    }
    const groups = await this.loadIndex();
    if (input.scope === "published" && !groups.get(safeSlug)?.published) {
      throw new CmsError(
        409,
        "conflict",
        "Publish the article before uploading public media. Stage images in the draft library instead.",
      );
    }
    const { filename, details } = validateMediaFile(
      input.bytes,
      input.filename,
    );
    const dir =
      input.scope === "draft"
        ? joinRepoPath(CMS_PATHS.draftMedia, safeSlug)
        : joinRepoPath(CMS_PATHS.publishedMedia, safeSlug);
    const entries = await this.github.list(dir);
    const warnings: string[] = [];

    if (input.replacePath) {
      if (!input.confirmReplace) {
        throw new CmsError(
          400,
          "validation_failed",
          "Confirm that you want to replace the existing image.",
        );
      }
      const prefix = `${dir}/`;
      if (!input.replacePath.startsWith(prefix)) {
        throw new CmsError(
          400,
          "bad_request",
          "That media file is not in this library.",
        );
      }
      const existingName = assertSafeRelativePath(
        input.replacePath.slice(prefix.length),
      );
      if (existingName.includes("/")) {
        throw new CmsError(400, "bad_request", "Unsafe media path.");
      }
      const existing = entries.find((entry) => entry.name === existingName);
      if (!existing) {
        throw new CmsError(404, "not_found", "That media file was not found.");
      }
      const normalize = (value: string) => (value === "jpeg" ? "jpg" : value);
      const oldExtension = normalize(
        existingName.split(".").pop()?.toLowerCase() ?? "",
      );
      const newExtension = normalize(details.extension);
      if (oldExtension !== newExtension) {
        throw new CmsError(
          415,
          "unsupported_media_type",
          "A replacement must use the same image format as the original.",
        );
      }
      const commit = await this.github.commit(
        [
          {
            path: mediaPath(input.scope, safeSlug, existingName),
            content: input.bytes,
            expectedSha: existing.sha,
          },
        ],
        `cms: replace media "${existingName}"`,
      );
      return {
        media: toMediaInfo(
          input.scope,
          safeSlug,
          existingName,
          input.bytes.length,
          await computeGitBlobSha(input.bytes),
          { width: details.width, height: details.height },
        ),
        commit,
        reused: false,
        warnings,
        deployment: null,
      };
    }

    const blobSha = await computeGitBlobSha(input.bytes);
    const existing = entries.find((entry) => entry.name === filename);
    if (existing?.sha === blobSha) {
      return {
        media: toMediaInfo(
          input.scope,
          safeSlug,
          filename,
          input.bytes.length,
          existing.sha,
          { width: details.width, height: details.height },
        ),
        commit: null,
        reused: true,
        warnings: ["That image is already in this library."],
        deployment: null,
      };
    }

    let destination = filename;
    if (existing) {
      const extension = filename.split(".").pop() as string;
      const stem = filename.slice(0, -(extension.length + 1));
      destination = `${stem}-${blobSha.slice(0, 8)}.${extension}`;
      const second = entries.find((entry) => entry.name === destination);
      if (second && second.sha !== blobSha) {
        destination = `${stem}-${blobSha.slice(0, 12)}.${extension}`;
      }
      const target = entries.find((entry) => entry.name === destination);
      if (target?.sha === blobSha) {
        return {
          media: toMediaInfo(
            input.scope,
            safeSlug,
            destination,
            input.bytes.length,
            target.sha,
            { width: details.width, height: details.height },
          ),
          commit: null,
          reused: true,
          warnings: ["That image is already in this library."],
          deployment: null,
        };
      }
    }

    const path = mediaPath(input.scope, safeSlug, destination);
    const commit = await this.github.commit(
      [{ path, content: input.bytes, expectedSha: null }],
      `cms: upload media "${destination}"`,
    );
    return {
      media: toMediaInfo(
        input.scope,
        safeSlug,
        destination,
        input.bytes.length,
        blobSha,
        { width: details.width, height: details.height },
      ),
      commit,
      reused: false,
      warnings,
      deployment: null,
    };
  }

  async deleteMedia(
    slug: string,
    scope: "draft" | "published",
    filename: string,
    confirmFilename: string,
  ): Promise<DeleteResult> {
    const safeSlug = assertSafeSlug(slug);
    if (scope === "draft") this.assertDraftWritesAllowed();
    if (confirmFilename !== filename) {
      throw new CmsError(
        400,
        "validation_failed",
        "Type the filename exactly to delete it.",
      );
    }
    if (
      !/^[a-z0-9][a-z0-9._-]*$/.test(filename) ||
      !isSupportedExtension(filename)
    ) {
      throw new CmsError(400, "bad_request", "Unsafe media filename.");
    }
    const path = mediaPath(scope, safeSlug, filename);
    const dir = path.slice(0, path.lastIndexOf("/"));
    const entries = await this.github.list(dir);
    const entry = entries.find((item) => item.path === path);
    if (!entry) {
      throw new CmsError(404, "not_found", "That media file was not found.");
    }

    const url = mediaUrl(scope, safeSlug, filename);
    const groups = await this.loadIndex();
    const references: string[] = [];
    for (const group of groups.values()) {
      for (const article of entriesOf(group)) {
        if (article.source.includes(url)) {
          references.push(`${article.slug} (${article.location})`);
        }
      }
    }
    if (references.length > 0) {
      throw new CmsError(
        409,
        "conflict",
        `This image is still referenced by ${[...new Set(references)].join(", ")}. Remove the references before deleting it.`,
        { details: { references: [...new Set(references)] } },
      );
    }

    const commit = await this.github.commit(
      [{ path, delete: true, expectedSha: entry.sha }],
      `cms: delete media "${filename}"`,
    );
    return { commit, warnings: [] };
  }

  async getDraftMedia(
    slug: string,
    filename: string,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const safeSlug = assertSafeSlug(slug);
    if (
      !/^[a-z0-9][a-z0-9._-]*$/.test(filename) ||
      !isSupportedExtension(filename)
    ) {
      throw new CmsError(400, "bad_request", "Unsafe media filename.");
    }
    const path = mediaPath("draft", safeSlug, filename);
    const raw = await this.github.getRaw(path);
    if (!raw) {
      throw new CmsError(
        404,
        "not_found",
        "That draft media file was not found.",
      );
    }
    const details = inspectImage(raw.bytes);
    return { bytes: raw.bytes, contentType: details.mime };
  }
}

export function articleServiceFromEnv(
  env: { [key: string]: string | undefined },
  github: GitHubGateway,
): ArticleService {
  return new ArticleService({
    github,
    repoPrivateConfirmed: env.CMS_REPO_PRIVATE_CONFIRMED === "true",
  });
}
