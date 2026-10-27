import type { ArticleType } from "../article-type.ts";
import type { TopicSlug } from "../topics.ts";

export type ArticleStatus = "draft" | "published";
export type ArticleLocation = "published" | "draft" | "archived";
export type SaveMode = "draft" | "publish";

export interface ArticleReference {
  title: string;
  url: string;
  annotation?: string;
}

export interface ArticleFrontmatter {
  title: string;
  subtitle?: string;
  slug: string;
  description: string;
  publishedAt?: string;
  updatedAt?: string;
  status: ArticleStatus;
  topics: TopicSlug[];
  articleType?: ArticleType;
  references?: ArticleReference[];
  technicalContext?: string;
  limitations?: string;
  coverImage?: string;
  coverAlt?: string;
  cmsUpdatedAt?: string;
  cmsArchivedAt?: string;
}

export interface ArticleInput {
  frontmatter: ArticleFrontmatter;
  body: string;
}

export interface ArticleDocument extends ArticleInput {
  location: ArticleLocation;
  path: string;
  sha: string;
  warnings: string[];
}

export interface ArticleDetail {
  document: ArticleDocument;
  locations: Partial<Record<ArticleLocation, ArticleLocationInfo>>;
  availableLocations: ArticleLocation[];
}

export interface ArticleLocationInfo {
  sha: string;
  path: string;
  updatedAt?: string;
}

export interface ArticleSummary {
  slug: string;
  title: string;
  description: string;
  state: "draft" | "published" | "published-with-draft" | "archived";
  topics: TopicSlug[];
  articleType?: ArticleType;
  publishedAt?: string;
  updatedAt?: string;
  cmsUpdatedAt?: string;
  cmsArchivedAt?: string;
  locations: Partial<Record<ArticleLocation, ArticleLocationInfo>>;
  warnings?: string[];
}

export interface RepoEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  sha: string;
  size: number;
}

export interface RepoTextFile {
  path: string;
  sha: string;
  content: string;
}

export interface RepoRawFile {
  path: string;
  sha: string;
  bytes: Uint8Array;
}

export interface FileChange {
  path: string;
  content?: string | Uint8Array;
  expectedSha?: string | null;
  delete?: boolean;
}

export interface CommitResult {
  commitSha: string;
  commitUrl: string;
  changed: string[];
}

export interface GitHubGateway {
  list(directory: string): Promise<RepoEntry[]>;
  getText(path: string): Promise<RepoTextFile | null>;
  getRaw(path: string): Promise<RepoRawFile | null>;
  commit(changes: FileChange[], message: string): Promise<CommitResult>;
}

export interface MediaInfo {
  filename: string;
  path: string;
  url: string;
  size: number;
  sha: string;
  width?: number;
  height?: number;
}

export interface MediaUpload {
  filename: string;
  bytes: Uint8Array;
  alt: string;
  caption?: string;
  scope: "draft" | "published";
  slug: string;
  replacePath?: string;
}

export interface MediaListResult {
  media: MediaInfo[];
  warnings: string[];
}

export interface MediaUploadResult {
  media: MediaInfo;
  commit: CommitResult | null;
  reused: boolean;
  warnings: string[];
  deployment: DeploymentStatus | null;
}

export interface DeleteResult {
  commit: CommitResult;
  warnings: string[];
  deployment?: DeploymentStatus | null;
}

export interface ImportResult {
  frontmatter: ArticleFrontmatter;
  body: string;
  warnings: string[];
}

export interface DeploymentStatus {
  state: string;
  url?: string;
  commitSha?: string;
  updatedAt?: string;
  detail?: string;
}

export interface CmsSession {
  email: string;
  dev: boolean;
  csrfToken: string;
  logoutUrl: string | null;
  topics: readonly { slug: string; label: string }[];
  articleTypes: readonly { slug: string; label: string }[];
  repoPrivateConfirmed: boolean;
  branch: string;
  deploymentConfigured: boolean;
}

export interface SaveArticleRequest {
  frontmatter: ArticleFrontmatter;
  body: string;
  mode: SaveMode;
  expectedSha?: string | null;
  expectedDraftSha?: string | null;
  expectedPublishedSha?: string | null;
  confirmSlug?: string;
}

export interface SaveArticleResult {
  commit: CommitResult;
  document: ArticleDocument;
  draftRemoved: boolean;
  mediaCopied: string[];
  warnings: string[];
  deployment: DeploymentStatus | null;
}
