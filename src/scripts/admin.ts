import DOMPurify from "dompurify";
import { marked } from "marked";

import type { ArticleType } from "../lib/article-type.ts";
import {
  CMS_API,
  CMS_BASE,
  MAX_MEDIA_BYTES,
  MAX_MEDIA_PER_UPLOAD,
} from "../lib/cms/constants.ts";
import type {
  ArticleDetail,
  ArticleFrontmatter,
  ArticleLocation,
  ArticleReference,
  ArticleSummary,
  CmsSession,
  DeleteResult,
  DeploymentStatus,
  ImportResult,
  MediaInfo,
  MediaListResult,
  MediaUploadResult,
  SaveArticleRequest,
  SaveArticleResult,
} from "../lib/cms/types.ts";

type Tone = "success" | "warning" | "error" | undefined;
type MediaPurpose = "insert" | "cover";
type MediaScope = "draft" | "published";

interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

interface FormSnapshot {
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  articleType: string;
  topics: string[];
  publishedAt: string;
  updatedAt: string;
  technicalContext: string;
  limitations: string;
  references: ArticleReference[];
  coverImage: string;
  coverAlt: string;
  body: string;
}

interface Recovery {
  savedAt: string;
  snapshot: FormSnapshot;
}

interface QueuedUpload {
  file: File;
  row: HTMLElement;
  alt: HTMLInputElement;
  caption: HTMLInputElement;
}

interface DeleteChoice {
  location: ArticleLocation;
  sha: string;
}

class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

const sessionEmail = byId<HTMLSpanElement>("session-email");
const refreshArticlesButton = byId<HTMLButtonElement>("refresh-articles");
const logoutLink = byId<HTMLAnchorElement>("logout");
const devBanner = byId<HTMLParagraphElement>("dev-banner");
const statusBar = byId<HTMLDivElement>("global-status");
const statusText = byId<HTMLSpanElement>("status-text");
const authError = byId<HTMLElement>("auth-error");
const authErrorMessage = byId<HTMLParagraphElement>("auth-error-message");
const authReload = byId<HTMLButtonElement>("auth-reload");
const configError = byId<HTMLElement>("config-error");
const configErrorMessage = byId<HTMLParagraphElement>("config-error-message");
const recoveryBanner = byId<HTMLDivElement>("recovery-banner");
const recoveryMessage = byId<HTMLSpanElement>("recovery-message");
const recoveryRestore = byId<HTMLButtonElement>("recovery-restore");
const recoveryDiscard = byId<HTMLButtonElement>("recovery-discard");
const workspace = byId<HTMLElement>("workspace");
const statDrafts = byId<HTMLSpanElement>("stat-drafts");
const statPublished = byId<HTMLSpanElement>("stat-published");
const statArchived = byId<HTMLSpanElement>("stat-archived");
const newArticleButton = byId<HTMLButtonElement>("new-article");
const articleSearch = byId<HTMLInputElement>("article-search");
const articleFilter = byId<HTMLSelectElement>("article-filter");
const listEmpty = byId<HTMLParagraphElement>("list-empty");
const articleList = byId<HTMLUListElement>("article-list");
const editorEmpty = byId<HTMLDivElement>("editor-empty");
const form = byId<HTMLFormElement>("article-form");
const editorLocation = byId<HTMLParagraphElement>("editor-location");
const editorHeading = byId<HTMLHeadingElement>("editor-heading");
const locationSelect = byId<HTMLSelectElement>("location-select");
const dirtyIndicator = byId<HTMLSpanElement>("dirty-indicator");
const titleInput = byId<HTMLInputElement>("title");
const slugInput = byId<HTMLInputElement>("slug");
const articleTypeSelect = byId<HTMLSelectElement>("article-type");
const subtitleInput = byId<HTMLInputElement>("subtitle");
const descriptionInput = byId<HTMLTextAreaElement>("description");
const topicsFieldset = byId<HTMLFieldSetElement>("topics-fieldset");
const publishedAtInput = byId<HTMLInputElement>("published-at");
const updatedAtInput = byId<HTMLInputElement>("updated-at");
const readingTime = byId<HTMLParagraphElement>("reading-time");
const coverPreview = byId<HTMLDivElement>("cover-preview");
const coverImagePreview = byId<HTMLImageElement>("cover-image-preview");
const coverAltPreview = byId<HTMLParagraphElement>("cover-alt-preview");
const coverImageInput = byId<HTMLInputElement>("cover-image");
const coverAltInput = byId<HTMLInputElement>("cover-alt");
const coverChoose = byId<HTMLButtonElement>("cover-choose");
const coverClear = byId<HTMLButtonElement>("cover-clear");
const technicalContextInput = byId<HTMLTextAreaElement>("technical-context");
const limitationsInput = byId<HTMLTextAreaElement>("limitations");
const referencesContainer = byId<HTMLDivElement>("references");
const addReferenceButton = byId<HTMLButtonElement>("add-reference");
const bodyInput = byId<HTMLTextAreaElement>("body");
const preview = byId<HTMLDivElement>("preview");
const editorGrid = byId<HTMLDivElement>("editor-grid");
const formErrors = byId<HTMLDivElement>("form-errors");
const saveDraftButton = byId<HTMLButtonElement>("save-draft");
const publishButton = byId<HTMLButtonElement>("publish");
const archiveButton = byId<HTMLButtonElement>("archive");
const deleteButton = byId<HTMLButtonElement>("delete");
const exportButton = byId<HTMLButtonElement>("export");
const importTrigger = byId<HTMLButtonElement>("import-trigger");
const importFile = byId<HTMLInputElement>("import-file");
const localSave = byId<HTMLParagraphElement>("local-save");
const deploymentText = byId<HTMLParagraphElement>("deployment-text");
const checkDeploymentButton = byId<HTMLButtonElement>("check-deployment");
const confirmDialog = byId<HTMLDialogElement>("confirm-dialog");
const confirmTitle = byId<HTMLHeadingElement>("confirm-title");
const confirmMessage = byId<HTMLParagraphElement>("confirm-message");
const confirmInputLabel = byId<HTMLLabelElement>("confirm-input-label");
const confirmInputCaption = byId<HTMLSpanElement>("confirm-input-caption");
const confirmInput = byId<HTMLInputElement>("confirm-input");
const confirmError = byId<HTMLParagraphElement>("confirm-error");
const confirmAccept = byId<HTMLButtonElement>("confirm-accept");
const deleteDialog = byId<HTMLDialogElement>("delete-dialog");
const deleteLocations = byId<HTMLFieldSetElement>("delete-locations");
const deleteSlugLabel = byId<HTMLElement>("delete-slug-label");
const deleteConfirm = byId<HTMLInputElement>("delete-confirm");
const deleteError = byId<HTMLParagraphElement>("delete-error");
const deleteAccept = byId<HTMLButtonElement>("delete-accept");
const mediaDialog = byId<HTMLDialogElement>("media-dialog");
const mediaTitle = byId<HTMLHeadingElement>("media-title");
const mediaClose = byId<HTMLButtonElement>("media-close");
const mediaHint = byId<HTMLParagraphElement>("media-hint");
const mediaStatus = byId<HTMLParagraphElement>("media-status");
const mediaGrid = byId<HTMLDivElement>("media-grid");
const mediaEmpty = byId<HTMLParagraphElement>("media-empty");
const mediaUploadForm = byId<HTMLFormElement>("media-upload-form");
const mediaFiles = byId<HTMLInputElement>("media-files");
const uploadQueueElement = byId<HTMLDivElement>("upload-queue");
const uploadButton = byId<HTMLButtonElement>("upload-button");
const mediaAlt = byId<HTMLInputElement>("media-alt");
const mediaCaption = byId<HTMLInputElement>("media-caption");
const mediaUse = byId<HTMLButtonElement>("media-use");
const replaceFile = byId<HTMLInputElement>("replace-file");
const referenceTemplate = byId<HTMLTemplateElement>("reference-template");
const uploadRowTemplate = byId<HTMLTemplateElement>("upload-row-template");

const RECOVERY_PREFIX = "fieldnotes-cms-recovery:v1:";
const LOCAL_DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const LOCAL_DATE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

let session: CmsSession | null = null;
let articles: ArticleSummary[] = [];
let current: ArticleDetail | null = null;
let currentSlug: string | null = null;
let currentLocation: ArticleLocation | null = null;
let dirty = false;
let saving = false;
let slugTouched = false;
let recovery: Recovery | null = null;
let previewTimer: number | undefined;
let recoveryTimer: number | undefined;
let previewRequest = 0;
let articleRequest = 0;
let lastCommitSha = "";
let mediaPurpose: MediaPurpose = "insert";
let mediaScope: MediaScope = "draft";
let mediaSlug = "";
let mediaItems: MediaInfo[] = [];
let selectedMedia: MediaInfo | null = null;
let mediaRequest = 0;
let uploadQueue: QueuedUpload[] = [];
let uploading = false;
let replaceTarget: MediaInfo | null = null;

function setStatus(message: string, tone: Tone = undefined): void {
  statusBar.className = `admin-status${tone ? ` admin-status--${tone}` : ""}`;
  statusText.textContent = message;
}

function showAuthError(message: string): void {
  authErrorMessage.textContent = message;
  authError.hidden = false;
  configError.hidden = true;
  workspace.hidden = true;
  setStatus("The publishing desk is locked.", "error");
}

function showConfigError(message: string): void {
  configErrorMessage.textContent = message;
  configError.hidden = false;
  authError.hidden = true;
  workspace.hidden = true;
  setStatus("The publishing desk is not configured.", "error");
}

function showFormError(message: string, field?: string): void {
  formErrors.textContent = message;
  formErrors.hidden = false;
  if (field) focusField(field);
}

function clearFormError(): void {
  formErrors.hidden = true;
  formErrors.textContent = "";
}

function focusField(field: string): void {
  const map: Record<string, HTMLElement> = {
    title: titleInput,
    slug: slugInput,
    subtitle: subtitleInput,
    description: descriptionInput,
    topics: topicsFieldset,
    articleType: articleTypeSelect,
    publishedAt: publishedAtInput,
    updatedAt: updatedAtInput,
    body: bodyInput,
    coverImage: coverChoose,
    coverAlt: mediaAlt,
    technicalContext: technicalContextInput,
    limitations: limitationsInput,
  };
  const target = map[field];
  if (target) {
    target.focus();
    target.scrollIntoView({ block: "center" });
  }
}

function errorFromPayload(payload: unknown): ApiErrorBody {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "object" &&
    (payload as { error?: unknown }).error !== null
  ) {
    return (payload as { error: ApiErrorBody }).error;
  }
  return {};
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  const ok =
    typeof payload === "object" &&
    payload !== null &&
    (payload as { ok?: unknown }).ok === true;
  if (!response.ok || !ok) {
    const error = errorFromPayload(payload);
    throw new ApiError(
      response.status,
      error.code ?? "http_error",
      error.message ?? `The request failed (${response.status}).`,
      error.details,
    );
  }
  return (payload as { data: T }).data;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && session) {
    headers.set("X-CMS-CSRF", session.csrfToken);
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  return parseApiResponse<T>(response);
}

function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

function apiJson<T>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body: unknown,
): Promise<T> {
  return request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function apiForm<T>(path: string, body: FormData): Promise<T> {
  return request<T>(path, { method: "POST", body });
}

async function loadSession(): Promise<CmsSession> {
  const response = await fetch(`${CMS_API}/session`, {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  return parseApiResponse<CmsSession>(response);
}

function handleApiError(error: unknown, context: "form" | "global"): void {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      persistRecovery();
      showAuthError(error.message);
      return;
    }
    if (error.status === 403 && error.code === "forbidden") {
      setStatus(
        "This session is no longer valid for that change. Reload the page to get a fresh session.",
        "error",
      );
      if (context === "form") showFormError(error.message);
      return;
    }
    if (context === "form") {
      const field =
        typeof error.details?.field === "string"
          ? error.details.field
          : typeof error.details?.tag === "string"
            ? "body"
            : undefined;
      showFormError(error.message, field);
    }
    setStatus(error.message, "error");
    return;
  }
  const message =
    error instanceof Error ? error.message : "Something went wrong.";
  if (context === "form") showFormError(message);
  setStatus(message, "error");
}

async function start(): Promise<void> {
  setStatus("Checking your publishing session…");
  try {
    session = await loadSession();
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      showAuthError(error.message);
    } else if (
      error instanceof ApiError &&
      (error.status === 503 || error.code === "not_configured")
    ) {
      showConfigError(error.message);
    } else {
      handleApiError(error, "global");
      showConfigError(
        error instanceof Error ? error.message : "The CMS is unavailable.",
      );
    }
    return;
  }

  sessionEmail.textContent = session.dev
    ? `${session.email} (local development)`
    : session.email;
  if (session.logoutUrl) {
    logoutLink.href = session.logoutUrl;
    logoutLink.hidden = false;
  }
  devBanner.hidden = !session.dev;
  workspace.hidden = false;
  authError.hidden = true;
  configError.hidden = true;

  if (!session.repoPrivateConfirmed) {
    setStatus(
      "Draft saving and private media are locked until the repository is confirmed private and CMS_REPO_PRIVATE_CONFIRMED=true. Published edits still work.",
      "warning",
    );
  } else {
    setStatus(`Connected to ${session.branch}. Loading articles…`);
  }

  try {
    await loadArticles();
    if (session.repoPrivateConfirmed) {
      setStatus(
        `Connected to ${session.branch}. ${articles.length} articles available.`,
      );
    }
  } catch (error) {
    handleApiError(error, "global");
  }
  updateActionState();
}

function renderStats(): void {
  const drafts = articles.filter(
    (article) =>
      article.state === "draft" || article.state === "published-with-draft",
  ).length;
  const published = articles.filter(
    (article) =>
      article.state === "published" || article.state === "published-with-draft",
  ).length;
  const archived = articles.filter(
    (article) => article.state === "archived",
  ).length;
  statDrafts.textContent = String(drafts);
  statPublished.textContent = String(published);
  statArchived.textContent = String(archived);
}

function articleTimestamp(article: ArticleSummary): string | undefined {
  return (
    article.cmsUpdatedAt ??
    article.updatedAt ??
    article.publishedAt ??
    article.cmsArchivedAt
  );
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : LOCAL_DATE_FORMAT.format(date);
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : LOCAL_DATE_TIME_FORMAT.format(date);
}

function topicsLabel(article: ArticleSummary): string {
  if (!session) return "";
  const labels = new Map(
    session.topics.map((topic) => [topic.slug, topic.label]),
  );
  const names = article.topics.map((topic) => labels.get(topic) ?? topic);
  if (names.length === 0) return "No topics";
  if (names.length <= 2) return names.join(" · ");
  return `${names.slice(0, 2).join(" · ")} +${names.length - 2}`;
}

function stateBadges(article: ArticleSummary): HTMLSpanElement[] {
  const badges: HTMLSpanElement[] = [];
  const add = (text: string, modifier: string) => {
    const badge = document.createElement("span");
    badge.className = `admin-badge admin-badge--${modifier}`;
    badge.textContent = text;
    badges.push(badge);
  };
  if (article.state === "draft") add("Draft", "draft");
  if (article.state === "published") add("Published", "published");
  if (article.state === "published-with-draft") {
    add("Published", "published");
    add("Draft changes", "draft");
  }
  if (article.state === "archived") add("Archived", "archived");
  if (article.warnings && article.warnings.length > 0)
    add("Check file", "warning");
  return badges;
}

function renderArticleList(): void {
  const term = articleSearch.value.trim().toLowerCase();
  const filter = articleFilter.value;
  const visible = articles.filter((article) => {
    if (
      term &&
      !article.title.toLowerCase().includes(term) &&
      !article.slug.toLowerCase().includes(term)
    ) {
      return false;
    }
    if (filter === "drafts") {
      return (
        article.state === "draft" || article.state === "published-with-draft"
      );
    }
    if (filter === "published") return article.state === "published";
    if (filter === "archived") return article.state === "archived";
    return true;
  });

  articleList.replaceChildren();
  listEmpty.hidden = visible.length > 0;
  listEmpty.textContent =
    articles.length === 0
      ? "No articles yet. Start a new draft."
      : "No articles match this view.";

  for (const article of visible) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-article-item";
    button.setAttribute(
      "aria-current",
      currentSlug === article.slug ? "true" : "false",
    );
    button.addEventListener("click", () => {
      if (saving) return;
      void selectArticle(article.slug);
    });

    const title = document.createElement("span");
    title.className = "admin-article-item__title";
    title.textContent = article.title || article.slug;

    const meta = document.createElement("span");
    meta.className = "admin-article-item__meta";
    for (const badge of stateBadges(article)) meta.append(badge);
    const date = formatDate(articleTimestamp(article));
    if (date) {
      const dateNode = document.createElement("span");
      dateNode.textContent = date;
      meta.append(dateNode);
    }
    const topics = document.createElement("span");
    topics.textContent = topicsLabel(article);
    meta.append(topics);

    button.append(title, meta);
    item.append(button);
    articleList.append(item);
  }
  renderStats();
}

async function loadArticles(): Promise<void> {
  const data = await apiGet<{ articles: ArticleSummary[] }>(
    `${CMS_API}/articles`,
  );
  articles = data.articles;
  renderArticleList();
}

function selectTopics(topics: readonly string[]): void {
  const chosen = new Set(topics);
  for (const input of Array.from(
    topicsFieldset.querySelectorAll<HTMLInputElement>('input[name="topics"]'),
  )) {
    input.checked = chosen.has(input.value);
  }
}

function selectedTopics(): string[] {
  return Array.from(
    topicsFieldset.querySelectorAll<HTMLInputElement>(
      'input[name="topics"]:checked',
    ),
  ).map((input) => input.value);
}

function isoToLocalInput(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}

function markDirty(): void {
  dirty = true;
  dirtyIndicator.hidden = false;
  updateReadingTime();
  schedulePreview();
  scheduleRecovery();
}

function clearDirty(): void {
  dirty = false;
  dirtyIndicator.hidden = true;
  window.clearTimeout(recoveryTimer);
}

function updateReadingTime(): void {
  const words = bodyInput.value.trim()
    ? bodyInput.value.trim().split(/\s+/).length
    : 0;
  const minutes = Math.max(1, Math.ceil(words / 200));
  readingTime.textContent = `${minutes} min read · ${words} ${words === 1 ? "word" : "words"}`;
}

function addReference(reference?: ArticleReference, mark = true): void {
  const fragment = referenceTemplate.content.cloneNode(
    true,
  ) as DocumentFragment;
  const fieldset =
    fragment.querySelector<HTMLFieldSetElement>(".admin-reference");
  if (!fieldset) return;
  const title = fieldset.querySelector<HTMLInputElement>("[data-ref-title]");
  const url = fieldset.querySelector<HTMLInputElement>("[data-ref-url]");
  const annotation = fieldset.querySelector<HTMLInputElement>(
    "[data-ref-annotation]",
  );
  if (!title || !url || !annotation) return;
  title.value = reference?.title ?? "";
  url.value = reference?.url ?? "";
  annotation.value = reference?.annotation ?? "";
  fieldset
    .querySelector<HTMLButtonElement>("[data-ref-remove]")
    ?.addEventListener("click", () => {
      fieldset.remove();
      if (mark) markDirty();
    });
  referencesContainer.append(fieldset);
  if (mark) markDirty();
}

function readReferences(mark = false): ArticleReference[] {
  const references: ArticleReference[] = [];
  for (const fieldset of Array.from(
    referencesContainer.querySelectorAll<HTMLFieldSetElement>(
      ".admin-reference",
    ),
  )) {
    const title = fieldset.querySelector<HTMLInputElement>("[data-ref-title]");
    const url = fieldset.querySelector<HTMLInputElement>("[data-ref-url]");
    const annotation = fieldset.querySelector<HTMLInputElement>(
      "[data-ref-annotation]",
    );
    const hasAny = Boolean(
      title?.value.trim() || url?.value.trim() || annotation?.value.trim(),
    );
    if (!hasAny) continue;
    if (!title?.value.trim() || !url?.value.trim()) {
      throw new Error("Each reference needs both a title and a URL.");
    }
    references.push({
      title: title.value.trim(),
      url: url.value.trim(),
      ...(annotation?.value.trim()
        ? { annotation: annotation.value.trim() }
        : {}),
    });
  }
  if (mark) markDirty();
  return references;
}

function renderCover(): void {
  const image = coverImageInput.value;
  const alt = coverAltInput.value;
  const allowed =
    image.length > 0 && isAllowedLibraryImage(image, slugInput.value.trim());
  if (allowed) {
    coverImagePreview.src = image;
    coverImagePreview.alt = alt;
    coverAltPreview.textContent = alt || "Alt text is missing.";
    coverPreview.hidden = false;
  } else {
    coverImagePreview.removeAttribute("src");
    coverImagePreview.alt = "";
    coverAltPreview.textContent = "";
    coverPreview.hidden = true;
  }
}

function readFormSnapshot(): FormSnapshot {
  return {
    title: titleInput.value,
    slug: slugInput.value,
    subtitle: subtitleInput.value,
    description: descriptionInput.value,
    articleType: articleTypeSelect.value,
    topics: selectedTopics(),
    publishedAt: publishedAtInput.value,
    updatedAt: updatedAtInput.value,
    technicalContext: technicalContextInput.value,
    limitations: limitationsInput.value,
    references: Array.from(
      referencesContainer.querySelectorAll<HTMLFieldSetElement>(
        ".admin-reference",
      ),
    ).map((fieldset) => ({
      title:
        fieldset.querySelector<HTMLInputElement>("[data-ref-title]")?.value ??
        "",
      url:
        fieldset.querySelector<HTMLInputElement>("[data-ref-url]")?.value ?? "",
      annotation:
        fieldset.querySelector<HTMLInputElement>("[data-ref-annotation]")
          ?.value ?? "",
    })),
    coverImage: coverImageInput.value,
    coverAlt: coverAltInput.value,
    body: bodyInput.value,
  };
}

function applySnapshot(snapshot: FormSnapshot): void {
  titleInput.value = snapshot.title;
  slugInput.value = snapshot.slug;
  subtitleInput.value = snapshot.subtitle;
  descriptionInput.value = snapshot.description;
  articleTypeSelect.value = snapshot.articleType;
  selectTopics(snapshot.topics);
  publishedAtInput.value = snapshot.publishedAt;
  updatedAtInput.value = snapshot.updatedAt;
  technicalContextInput.value = snapshot.technicalContext;
  limitationsInput.value = snapshot.limitations;
  referencesContainer.replaceChildren();
  for (const reference of snapshot.references) {
    if (
      reference.title.trim() ||
      reference.url.trim() ||
      reference.annotation?.trim()
    ) {
      addReference(reference, false);
    }
  }
  coverImageInput.value = snapshot.coverImage;
  coverAltInput.value = snapshot.coverAlt;
  bodyInput.value = snapshot.body;
  renderCover();
  updateReadingTime();
  schedulePreview(0);
}

function snapshotFromFrontmatter(
  frontmatter: ArticleFrontmatter,
  body: string,
): FormSnapshot {
  return {
    title: frontmatter.title,
    slug: frontmatter.slug,
    subtitle: frontmatter.subtitle ?? "",
    description: frontmatter.description,
    articleType: frontmatter.articleType ?? "",
    topics: frontmatter.topics,
    publishedAt: isoToLocalInput(frontmatter.publishedAt),
    updatedAt: isoToLocalInput(frontmatter.updatedAt),
    technicalContext: frontmatter.technicalContext ?? "",
    limitations: frontmatter.limitations ?? "",
    references: frontmatter.references ?? [],
    coverImage: frontmatter.coverImage ?? "",
    coverAlt: frontmatter.coverAlt ?? "",
    body,
  };
}

function recoveryKey(): string {
  return `${RECOVERY_PREFIX}${currentSlug ?? "new"}:${currentLocation ?? "new"}`;
}

function persistRecovery(): void {
  if (!dirty || form.hidden) return;
  try {
    const payload: Recovery = {
      savedAt: new Date().toISOString(),
      snapshot: readFormSnapshot(),
    };
    window.localStorage.setItem(recoveryKey(), JSON.stringify(payload));
    localSave.textContent = `Text kept in this browser at ${formatDateTime(payload.savedAt)}.`;
  } catch {
    localSave.textContent =
      "This browser could not store a local recovery copy.";
  }
}

function scheduleRecovery(): void {
  window.clearTimeout(recoveryTimer);
  recoveryTimer = window.setTimeout(persistRecovery, 900);
}

function checkRecovery(): void {
  recovery = null;
  recoveryBanner.hidden = true;
  let parsed: Recovery;
  try {
    const raw = window.localStorage.getItem(recoveryKey());
    if (!raw) return;
    parsed = JSON.parse(raw) as Recovery;
  } catch {
    return;
  }
  if (
    typeof parsed.savedAt !== "string" ||
    typeof parsed.snapshot !== "object" ||
    parsed.snapshot === null
  ) {
    return;
  }
  const age = Date.now() - new Date(parsed.savedAt).getTime();
  if (!Number.isFinite(age) || age > 7 * 24 * 60 * 60 * 1000) {
    window.localStorage.removeItem(recoveryKey());
    return;
  }
  if (JSON.stringify(parsed.snapshot) === JSON.stringify(readFormSnapshot())) {
    window.localStorage.removeItem(recoveryKey());
    return;
  }
  recovery = parsed;
  recoveryMessage.textContent = `Text saved in this browser at ${formatDateTime(parsed.savedAt)} differs from the repository file.`;
  recoveryBanner.hidden = false;
}

function clearRecoveryForSlug(slug: string): void {
  const prefix = `${RECOVERY_PREFIX}${slug}:`;
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  for (const key of keys) window.localStorage.removeItem(key);
}

function clearNewRecovery(): void {
  window.localStorage.removeItem(`${RECOVERY_PREFIX}new:new`);
}

function clearLocalSaveMessage(): void {
  localSave.textContent = "";
}

function clearEditor(): void {
  current = null;
  currentSlug = null;
  currentLocation = null;
  form.hidden = true;
  editorEmpty.hidden = false;
  recoveryBanner.hidden = true;
  clearDirty();
  locationSelect.replaceChildren();
  renderArticleList();
  updateActionState();
}

function showEditor(): void {
  form.hidden = false;
  editorEmpty.hidden = true;
}

function prepareNewArticle(): void {
  if (saving) return;
  if (dirty) persistRecovery();
  current = null;
  currentSlug = null;
  currentLocation = null;
  slugTouched = false;
  showEditor();
  form.reset();
  referencesContainer.replaceChildren();
  coverImageInput.value = "";
  coverAltInput.value = "";
  articleTypeSelect.value = "";
  selectTopics([]);
  bodyInput.value = "";
  publishedAtInput.value = "";
  updatedAtInput.value = "";
  editorLocation.textContent = "New article · not yet saved";
  editorHeading.textContent = "New article";
  locationSelect.replaceChildren();
  const option = document.createElement("option");
  option.value = "";
  option.textContent = "New draft";
  locationSelect.append(option);
  locationSelect.disabled = true;
  clearFormError();
  clearLocalSaveMessage();
  clearDirty();
  renderCover();
  updateReadingTime();
  schedulePreview(0);
  renderArticleList();
  updateActionState();
  recovery = null;
  recoveryBanner.hidden = true;
  checkRecovery();
  setStatus(
    session?.repoPrivateConfirmed
      ? "New article. Save a draft before uploading media."
      : "New article. Draft saving is locked until the CMS is configured for a private repository.",
  );
  titleInput.focus();
}

function locationLabel(location: ArticleLocation): string {
  if (location === "draft") return "Draft";
  if (location === "published") return "Published";
  return "Archived";
}

function populateLocationSelect(detail: ArticleDetail): void {
  locationSelect.replaceChildren();
  const order: ArticleLocation[] = ["draft", "published", "archived"];
  for (const location of order) {
    if (!detail.availableLocations.includes(location)) continue;
    const option = document.createElement("option");
    option.value = location;
    option.textContent = locationLabel(location);
    locationSelect.append(option);
  }
  locationSelect.value = detail.document.location;
  locationSelect.disabled = detail.availableLocations.length <= 1;
}

function populateArticle(detail: ArticleDetail): void {
  current = detail;
  currentSlug = detail.document.frontmatter.slug;
  currentLocation = detail.document.location;
  showEditor();
  const frontmatter = detail.document.frontmatter;
  titleInput.value = frontmatter.title;
  slugInput.value = frontmatter.slug;
  subtitleInput.value = frontmatter.subtitle ?? "";
  descriptionInput.value = frontmatter.description;
  articleTypeSelect.value = frontmatter.articleType ?? "";
  selectTopics(frontmatter.topics);
  publishedAtInput.value = isoToLocalInput(frontmatter.publishedAt);
  updatedAtInput.value = isoToLocalInput(frontmatter.updatedAt);
  technicalContextInput.value = frontmatter.technicalContext ?? "";
  limitationsInput.value = frontmatter.limitations ?? "";
  referencesContainer.replaceChildren();
  for (const reference of frontmatter.references ?? []) {
    addReference(reference, false);
  }
  coverImageInput.value = frontmatter.coverImage ?? "";
  coverAltInput.value = frontmatter.coverAlt ?? "";
  bodyInput.value = detail.document.body;
  editorHeading.textContent = frontmatter.title || frontmatter.slug;
  editorLocation.textContent = `${locationLabel(detail.document.location)} · ${detail.document.path}`;
  populateLocationSelect(detail);
  renderCover();
  updateReadingTime();
  schedulePreview(0);
  clearFormError();
  clearLocalSaveMessage();
  clearDirty();
  renderArticleList();
  updateActionState();
  checkRecovery();
}

async function selectArticle(
  slug: string,
  location?: ArticleLocation,
  options: { quiet?: boolean } = {},
): Promise<void> {
  if (saving) return;
  if (dirty) persistRecovery();
  const requestId = ++articleRequest;
  if (!options.quiet) {
    setStatus(`Loading ${slug}…`);
    form.inert = true;
  }
  try {
    const suffix = location ? `?location=${encodeURIComponent(location)}` : "";
    const detail = await apiGet<ArticleDetail>(
      `${CMS_API}/articles/${encodeURIComponent(slug)}${suffix}`,
    );
    if (requestId !== articleRequest) return;
    populateArticle(detail);
    if (!options.quiet) {
      setStatus(
        [
          `Editing ${detail.document.frontmatter.title || slug}.`,
          ...detail.document.warnings,
        ].join(" "),
        detail.document.warnings.length > 0 ? "warning" : undefined,
      );
    }
  } catch (error) {
    if (requestId !== articleRequest) return;
    handleApiError(error, "global");
  } finally {
    if (requestId === articleRequest && !saving) form.inert = false;
  }
}

function currentHasPublished(): boolean {
  return Boolean(current?.locations.published);
}

function currentHasDraft(): boolean {
  return Boolean(current?.locations.draft);
}

function updateActionState(): void {
  const draftLocked = session ? !session.repoPrivateConfirmed : true;
  saveDraftButton.disabled = draftLocked;
  saveDraftButton.title = draftLocked
    ? "Draft saving is locked until the repository is confirmed private."
    : "";
  saveDraftButton.textContent = currentHasDraft()
    ? "Save draft"
    : "Save as draft";

  const draftBlocksPublish =
    Boolean(current) && currentLocation !== "draft" && currentHasDraft();
  publishButton.disabled = draftBlocksPublish;
  publishButton.title = draftBlocksPublish
    ? "Open the working draft to publish its changes. Publishing this version could discard the draft."
    : "";

  archiveButton.hidden =
    !currentHasPublished() || Boolean(current?.locations.archived);
  deleteButton.hidden = !current;
  exportButton.hidden = !currentSlug;
  slugInput.readOnly = Boolean(currentSlug);
  coverChoose.disabled = !currentSlug;
  coverChoose.title = currentSlug
    ? ""
    : "Save the draft before choosing a cover image.";
  if (!current) {
    locationSelect.disabled = true;
  }
}

function preferredLocation(summary: ArticleSummary): ArticleLocation {
  if (summary.locations.draft) return "draft";
  if (summary.locations.published) return "published";
  return "archived";
}

function collectFrontmatter(mode: "draft" | "publish"): ArticleFrontmatter {
  const slug = slugInput.value.trim();
  if (!slug) throw new Error("A slug is required.");
  const topics = selectedTopics();
  if (topics.length === 0) {
    throw new Error("Choose at least one topic.");
  }
  const references = readReferences();
  const articleType = articleTypeSelect.value;
  const coverImage = coverImageInput.value;
  const coverAlt = coverAltInput.value.trim();
  if (coverImage && !coverAlt) {
    throw new Error("The cover image needs alt text.");
  }
  return {
    title: titleInput.value.trim(),
    slug,
    description: descriptionInput.value.trim(),
    status: mode === "draft" ? "draft" : "published",
    topics: topics as ArticleFrontmatter["topics"],
    ...(subtitleInput.value.trim()
      ? { subtitle: subtitleInput.value.trim() }
      : {}),
    ...(articleType ? { articleType: articleType as ArticleType } : {}),
    ...(publishedAtInput.value
      ? { publishedAt: localInputToIso(publishedAtInput.value) }
      : {}),
    ...(updatedAtInput.value
      ? { updatedAt: localInputToIso(updatedAtInput.value) }
      : {}),
    ...(references.length > 0 ? { references } : {}),
    ...(technicalContextInput.value.trim()
      ? { technicalContext: technicalContextInput.value.trim() }
      : {}),
    ...(limitationsInput.value.trim()
      ? { limitations: limitationsInput.value.trim() }
      : {}),
    ...(coverImage ? { coverImage } : {}),
    ...(coverImage && coverAlt ? { coverAlt } : {}),
  };
}

async function save(mode: "draft" | "publish"): Promise<void> {
  if (saving || !session) return;
  clearFormError();
  if (!form.reportValidity()) return;
  if (mode === "publish" && !bodyInput.value.trim()) {
    showFormError("An article cannot be published with an empty body.", "body");
    return;
  }
  if (
    mode === "publish" &&
    current &&
    currentLocation !== "draft" &&
    currentHasDraft()
  ) {
    showFormError(
      "Open the working draft and publish from there so its changes are not discarded.",
      "body",
    );
    return;
  }

  let frontmatter: ArticleFrontmatter;
  try {
    frontmatter = collectFrontmatter(mode);
  } catch (error) {
    showFormError(
      error instanceof Error ? error.message : "Check the article fields.",
    );
    return;
  }

  if (mode === "publish") {
    const confirmed = await askConfirm({
      title: currentHasPublished()
        ? "Update published article?"
        : "Publish article?",
      message:
        "This commits the article to the publishing branch and starts a Cloudflare Pages build once the project is connected.",
      acceptLabel: currentHasPublished() ? "Update article" : "Publish article",
    });
    if (!confirmed) return;
  }

  const wasNew = !currentSlug;
  setBusy(true, mode === "draft" ? "Saving draft…" : "Publishing…");
  try {
    const payload: SaveArticleRequest = {
      frontmatter,
      body: bodyInput.value,
      mode,
      expectedDraftSha: current?.locations.draft?.sha ?? null,
      expectedPublishedSha: current?.locations.published?.sha ?? null,
    };
    const result = currentSlug
      ? await apiJson<SaveArticleResult>(
          `${CMS_API}/articles/${encodeURIComponent(currentSlug)}`,
          "PUT",
          payload,
        )
      : await apiJson<SaveArticleResult>(
          `${CMS_API}/articles`,
          "POST",
          payload,
        );

    dirty = false;
    dirtyIndicator.hidden = true;
    window.clearTimeout(recoveryTimer);
    const savedSlug = result.document.frontmatter.slug;
    clearRecoveryForSlug(savedSlug);
    if (wasNew) clearNewRecovery();
    clearLocalSaveMessage();

    const base =
      mode === "draft"
        ? result.commit.changed.length > 0
          ? "Draft saved."
          : "There were no draft changes to save."
        : result.commit.changed.length > 0
          ? "Article published."
          : "There were no changes to publish.";
    setStatus(
      [base, ...result.warnings].join(" "),
      result.warnings.length > 0 ? "warning" : "success",
    );
    showDeployment(result.deployment, result.commit.commitSha);
    setBusy(false);

    try {
      await loadArticles();
      await selectArticle(savedSlug, mode === "draft" ? "draft" : "published", {
        quiet: true,
      });
    } catch {
      setStatus(
        `${base} The saved article could not be reloaded. Refresh before making another change.`,
        "warning",
      );
    }
  } catch (error) {
    persistRecovery();
    handleApiError(error, "form");
  } finally {
    setBusy(false);
  }
}

function setBusy(busy: boolean, message?: string): void {
  saving = busy;
  form.inert = busy;
  if (busy && message) setStatus(message);
  if (!busy) updateActionState();
}

function showDeployment(
  deployment: DeploymentStatus | null | undefined,
  commitSha?: string,
): void {
  if (commitSha) lastCommitSha = commitSha;
  deploymentText.replaceChildren();
  let message: string;
  if (!deployment) {
    message = session?.deploymentConfigured
      ? "Commit created. Deployment status is not available yet."
      : "Commit created. Cloudflare Pages is not connected, so live deployment status is unavailable.";
  } else {
    message = deployment.detail
      ? `Deployment ${deployment.state}: ${deployment.detail}`
      : `Deployment ${deployment.state}.`;
  }
  deploymentText.append(document.createTextNode(message));
  if (deployment?.url && /^https?:\/\//i.test(deployment.url)) {
    const link = document.createElement("a");
    link.href = deployment.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = " Open deployment";
    deploymentText.append(link);
  }
  checkDeploymentButton.hidden =
    !session?.deploymentConfigured || !lastCommitSha;
}

async function checkDeployment(): Promise<void> {
  if (!lastCommitSha || !session?.deploymentConfigured) return;
  checkDeploymentButton.disabled = true;
  setStatus("Checking deployment status…");
  try {
    const data = await apiGet<{ deployment: DeploymentStatus | null }>(
      `${CMS_API}/deployment?sha=${encodeURIComponent(lastCommitSha)}`,
    );
    showDeployment(data.deployment, lastCommitSha);
    setStatus(
      data.deployment
        ? `Deployment ${data.deployment.state}.`
        : "Cloudflare has not reported a deployment for that commit yet.",
      data.deployment?.state === "success" ? "success" : undefined,
    );
  } catch (error) {
    handleApiError(error, "global");
  } finally {
    checkDeploymentButton.disabled = false;
  }
}

async function archiveArticle(): Promise<void> {
  if (!current || !current.locations.published || saving) return;
  if (dirty) persistRecovery();
  const slug = current.document.frontmatter.slug;
  const confirmed = await askConfirm({
    title: "Archive this article?",
    message:
      "The published file is removed from the site after the next build and copied to drafts/archive/ for the repository record. A working draft, if any, is left in place.",
    acceptLabel: "Archive article",
    danger: true,
    requireText: slug,
    inputCaption: `Type ${slug} to archive`,
  });
  if (!confirmed) return;
  const expectedSha = current.locations.published?.sha;
  if (!expectedSha) {
    showFormError("Reload the article before archiving it.");
    return;
  }
  setBusy(true, "Archiving…");
  try {
    const result = await apiJson<DeleteResult>(
      `${CMS_API}/articles/${encodeURIComponent(slug)}/archive`,
      "POST",
      { expectedSha, confirmSlug: slug },
    );
    setStatus(
      ["Article archived.", ...result.warnings].join(" "),
      result.warnings.length > 0 ? "warning" : "success",
    );
    showDeployment(result.deployment, result.commit.commitSha);
    setBusy(false);
    await loadArticles();
    const summary = articles.find((article) => article.slug === slug);
    if (summary) {
      await selectArticle(slug, preferredLocation(summary), { quiet: true });
    } else {
      clearEditor();
    }
  } catch (error) {
    handleApiError(error, "form");
  } finally {
    setBusy(false);
  }
}

async function deleteFile(): Promise<void> {
  if (!current || saving) return;
  if (dirty) persistRecovery();
  const hadLocalChanges = dirty;
  const slug = current.document.frontmatter.slug;
  const choice = await askDeleteFile(slug);
  if (!choice) return;
  setBusy(true, "Deleting file…");
  try {
    const params = new URLSearchParams({
      location: choice.location,
      expectedSha: choice.sha,
      confirm: slug,
    });
    const result = await apiJson<DeleteResult>(
      `${CMS_API}/articles/${encodeURIComponent(slug)}?${params.toString()}`,
      "DELETE",
      {},
    );
    if (!hadLocalChanges) clearRecoveryForSlug(slug);
    setStatus(
      [
        `${locationLabel(choice.location)} file deleted.`,
        ...result.warnings,
      ].join(" "),
      result.warnings.length > 0 ? "warning" : "success",
    );
    showDeployment(result.deployment, result.commit.commitSha);
    setBusy(false);
    await loadArticles();
    const summary = articles.find((article) => article.slug === slug);
    if (summary) {
      await selectArticle(slug, preferredLocation(summary), { quiet: true });
    } else {
      clearEditor();
    }
  } catch (error) {
    handleApiError(error, "form");
  } finally {
    setBusy(false);
  }
}

function exportFilename(disposition: string | null, fallback: string): string {
  const match = disposition?.match(/filename="([^"]+)"/i);
  const candidate = match?.[1] ?? fallback;
  return /^[a-z0-9._-]+$/i.test(candidate)
    ? candidate
    : `${currentSlug ?? "article"}.md`;
}

async function exportMarkdown(): Promise<void> {
  if (!currentSlug) return;
  setStatus("Preparing Markdown export…");
  try {
    const suffix = currentLocation
      ? `?location=${encodeURIComponent(currentLocation)}`
      : "";
    const response = await fetch(
      `${CMS_API}/articles/${encodeURIComponent(currentSlug)}/export${suffix}`,
      {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "text/markdown" },
      },
    );
    if (!response.ok) {
      const text = await response.text();
      let payload: unknown = null;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
      const error = errorFromPayload(payload);
      throw new ApiError(
        response.status,
        error.code ?? "http_error",
        error.message ?? "The Markdown could not be exported.",
      );
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportFilename(
      response.headers.get("content-disposition"),
      `${currentSlug}.md`,
    );
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("Markdown exported.", "success");
  } catch (error) {
    handleApiError(error, "global");
  }
}

async function importMarkdown(file: File): Promise<void> {
  if (file.size > 512 * 1024) {
    showFormError("The imported Markdown is larger than 512 KB.");
    return;
  }
  if (dirty) persistRecovery();
  setStatus("Reading Markdown…");
  try {
    const source = await file.text();
    const result = await apiJson<ImportResult>(`${CMS_API}/import`, "POST", {
      source,
    });
    current = null;
    currentSlug = null;
    currentLocation = null;
    slugTouched = false;
    showEditor();
    form.reset();
    referencesContainer.replaceChildren();
    applySnapshot(snapshotFromFrontmatter(result.frontmatter, result.body));
    slugTouched = Boolean(result.frontmatter.slug);
    editorLocation.textContent = "Imported article · not yet saved";
    editorHeading.textContent = result.frontmatter.title || "Imported article";
    locationSelect.replaceChildren();
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "New draft";
    locationSelect.append(option);
    locationSelect.disabled = true;
    clearFormError();
    recovery = null;
    recoveryBanner.hidden = true;
    dirty = true;
    dirtyIndicator.hidden = false;
    updateReadingTime();
    schedulePreview(0);
    persistRecovery();
    renderArticleList();
    updateActionState();
    setStatus(
      [
        "Imported Markdown. Review the metadata and body before saving.",
        ...result.warnings,
      ].join(" "),
      "warning",
    );
  } catch (error) {
    handleApiError(error, "form");
  } finally {
    importFile.value = "";
  }
}

function setEditorView(view: "write" | "split" | "preview"): void {
  editorGrid.dataset.view = view;
  for (const button of Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-view]"),
  )) {
    button.setAttribute(
      "aria-pressed",
      button.dataset.view === view ? "true" : "false",
    );
  }
  if (view !== "write") schedulePreview(0);
}

function schedulePreview(delay = 150): void {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => {
    void renderPreview();
  }, delay);
}

async function renderPreview(): Promise<void> {
  const requestId = ++previewRequest;
  const source = bodyInput.value;
  if (!source.trim()) {
    preview.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "admin-muted";
    empty.textContent = "Nothing to preview yet.";
    preview.append(empty);
    return;
  }
  try {
    const html = await marked.parse(source, { gfm: true, breaks: false });
    if (requestId !== previewRequest) return;
    const clean = DOMPurify.sanitize(html, {
      FORBID_TAGS: [
        "script",
        "style",
        "iframe",
        "object",
        "embed",
        "form",
        "input",
        "button",
        "textarea",
        "video",
        "audio",
        "source",
        "base",
        "meta",
        "link",
      ],
      FORBID_ATTR: ["style", "srcset", "background"],
    });
    preview.innerHTML = clean;
  } catch {
    if (requestId !== previewRequest) return;
    preview.replaceChildren();
    const error = document.createElement("p");
    error.className = "admin-error";
    error.textContent = "The Markdown preview could not be rendered.";
    preview.append(error);
  }
}

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (!(node instanceof Element)) return;
  if (node.tagName === "A") {
    node.setAttribute("rel", "noopener noreferrer");
  }
  if (node.tagName === "IMG") {
    const source = node.getAttribute("src") ?? "";
    if (!isAllowedLibraryImage(source, slugInput.value.trim())) {
      node.remove();
      return;
    }
    node.removeAttribute("srcset");
    node.removeAttribute("style");
    node.setAttribute("loading", "lazy");
    node.setAttribute("decoding", "async");
  }
});

function isAllowedLibraryImage(source: string, slug: string): boolean {
  if (!source || !slug) return false;
  try {
    const url = new URL(source, window.location.origin);
    if (url.origin !== window.location.origin) return false;
    const path = url.pathname;
    const publishedPrefix = `/images/${slug}/`;
    if (path.startsWith(publishedPrefix)) {
      return (
        path.slice(publishedPrefix.length).length > 0 &&
        !path.slice(publishedPrefix.length).includes("/")
      );
    }
    const draftPrefix = `${CMS_BASE}/api/media/draft/${slug}/`;
    if (path.startsWith(draftPrefix)) {
      return (
        path.slice(draftPrefix.length).length > 0 &&
        !path.slice(draftPrefix.length).includes("/")
      );
    }
    return false;
  } catch {
    return false;
  }
}

function wrapSelection(
  before: string,
  after: string,
  placeholder: string,
): void {
  const start = bodyInput.selectionStart ?? bodyInput.value.length;
  const end = bodyInput.selectionEnd ?? start;
  const selected = bodyInput.value.slice(start, end) || placeholder;
  const inserted = `${before}${selected}${after}`;
  bodyInput.setRangeText(inserted, start, end, "end");
  bodyInput.setSelectionRange(
    start + before.length,
    start + before.length + selected.length,
  );
  bodyInput.focus();
  bodyInput.dispatchEvent(new Event("input", { bubbles: true }));
}

function prefixLines(prefix: string, heading = false): void {
  const start = bodyInput.selectionStart ?? bodyInput.value.length;
  const end = bodyInput.selectionEnd ?? start;
  const lineStart =
    bodyInput.value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const nextBreak = bodyInput.value.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? bodyInput.value.length : nextBreak;
  const block = bodyInput.value.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const already = lines.every((line) =>
    heading
      ? new RegExp(`^#{${prefix.length}}\\s`).test(line)
      : line.startsWith(prefix),
  );
  const transformed = lines
    .map((line) => {
      const clean = heading ? line.replace(/^#{1,6}\s+/, "") : line;
      if (already) {
        return heading ? clean : line.replace(new RegExp(`^${prefix}`), "");
      }
      return `${prefix}${clean}`;
    })
    .join("\n");
  bodyInput.setRangeText(transformed, lineStart, lineEnd, "end");
  bodyInput.setSelectionRange(lineStart, lineStart + transformed.length);
  bodyInput.focus();
  bodyInput.dispatchEvent(new Event("input", { bubbles: true }));
}

function insertLink(): void {
  const start = bodyInput.selectionStart ?? bodyInput.value.length;
  const end = bodyInput.selectionEnd ?? start;
  const text = bodyInput.value.slice(start, end) || "link text";
  const url = "https://";
  const inserted = `[${text}](${url})`;
  bodyInput.setRangeText(inserted, start, end, "end");
  const urlStart = start + text.length + 3;
  bodyInput.setSelectionRange(urlStart, urlStart + url.length);
  bodyInput.focus();
  bodyInput.dispatchEvent(new Event("input", { bubbles: true }));
}

function applyFormat(format: string): void {
  if (format === "h2") prefixLines("## ", true);
  else if (format === "h3") prefixLines("### ", true);
  else if (format === "bold") wrapSelection("**", "**", "bold text");
  else if (format === "italic") wrapSelection("*", "*", "italic text");
  else if (format === "code") wrapSelection("`", "`", "code");
  else if (format === "codeblock") wrapSelection("```\n", "\n```", "code");
  else if (format === "quote") prefixLines("> ");
  else if (format === "list") prefixLines("- ");
  else if (format === "link") insertLink();
  else if (format === "media") openMedia("insert");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildFigure(media: MediaInfo, alt: string, caption: string): string {
  const dimensions =
    media.width && media.height
      ? ` width="${media.width}" height="${media.height}"`
      : "";
  const captionMarkup = caption
    ? `\n  <figcaption>${escapeHtml(caption)}</figcaption>`
    : "";
  return `<figure>\n  <img src="${escapeHtml(media.url)}" alt="${escapeHtml(alt)}"${dimensions} loading="lazy" decoding="async" />${captionMarkup}\n</figure>`;
}

function insertAtCursor(text: string): void {
  const start = bodyInput.selectionStart ?? bodyInput.value.length;
  const end = bodyInput.selectionEnd ?? start;
  bodyInput.setRangeText(text, start, end, "end");
  bodyInput.setSelectionRange(start + text.length, start + text.length);
  bodyInput.focus();
  bodyInput.dispatchEvent(new Event("input", { bubbles: true }));
}

function scopeAllowed(scope: MediaScope): boolean {
  return scope === "draft"
    ? Boolean(session?.repoPrivateConfirmed)
    : currentHasPublished();
}

function openMedia(purpose: MediaPurpose): void {
  if (!currentSlug) {
    setStatus(
      "Save the draft first so the image library has an article slug.",
      "warning",
    );
    return;
  }
  if (uploading) {
    setStatus("Wait for the current upload to finish.", "warning");
    return;
  }
  mediaPurpose = purpose;
  mediaSlug = currentSlug;
  selectedMedia = null;
  replaceTarget = null;
  clearUploadQueue();
  mediaAlt.value = "";
  mediaCaption.value = "";
  mediaStatus.textContent = "";
  mediaTitle.textContent =
    mediaPurpose === "cover" ? "Choose a cover image" : "Image library";
  mediaUse.textContent =
    mediaPurpose === "cover" ? "Set cover" : "Insert at cursor";
  const legend = document.getElementById("media-use-legend");
  if (legend) {
    legend.textContent =
      mediaPurpose === "cover"
        ? "Use an image as the cover"
        : "Insert an image";
  }
  mediaCaption
    .closest<HTMLElement>(".admin-field")
    ?.toggleAttribute("hidden", mediaPurpose === "cover");
  const preferred: MediaScope =
    scopeAllowed("draft") && currentLocation !== "published"
      ? "draft"
      : scopeAllowed("published")
        ? "published"
        : "draft";
  mediaScope = preferred;
  updateMediaScopeButtons();
  if (!mediaDialog.open) mediaDialog.showModal();
  void refreshMedia(preferred);
  if (!scopeAllowed(preferred)) {
    mediaStatus.textContent =
      "This article has no writable media library yet. Save a draft with a private repository enabled, or publish the article for public media.";
  }
}

function updateMediaScopeButtons(): void {
  for (const button of Array.from(
    mediaDialog.querySelectorAll<HTMLButtonElement>("[data-media-scope]"),
  )) {
    const scope = button.dataset.mediaScope as MediaScope | undefined;
    button.setAttribute(
      "aria-pressed",
      scope === mediaScope ? "true" : "false",
    );
    if (scope === "draft" || scope === "published") {
      button.disabled = !scopeAllowed(scope) || uploading;
    }
  }
  const writable = scopeAllowed(mediaScope);
  mediaHint.textContent =
    mediaScope === "draft"
      ? `Private files in drafts/media/${mediaSlug}/. They are copied to /images/${mediaSlug}/ only when the article is published.`
      : `Public files in public/images/${mediaSlug}/. These are live after the next build.`;
  mediaUse.disabled = !selectedMedia || uploading || !writable;
  uploadButton.disabled = uploading || !writable;
  mediaFiles.disabled = uploading || !writable;
  mediaClose.disabled = uploading;
}

async function refreshMedia(
  scope: MediaScope,
  selectFilename?: string,
): Promise<void> {
  if (!mediaSlug) return;
  const requestId = ++mediaRequest;
  mediaStatus.textContent = "Loading images…";
  selectedMedia = null;
  updateMediaScopeButtons();
  try {
    const data = await apiGet<MediaListResult>(
      `${CMS_API}/articles/${encodeURIComponent(mediaSlug)}/media?scope=${scope}`,
    );
    if (requestId !== mediaRequest || scope !== mediaScope) return;
    mediaItems = data.media;
    renderMedia();
    if (selectFilename) {
      const match = mediaItems.find((item) => item.filename === selectFilename);
      if (match) selectMediaItem(match);
    }
    mediaStatus.textContent =
      data.warnings.length > 0
        ? data.warnings.join(" ")
        : `${data.media.length} ${data.media.length === 1 ? "image" : "images"}.`;
  } catch (error) {
    if (requestId !== mediaRequest) return;
    mediaItems = [];
    renderMedia();
    mediaStatus.textContent =
      error instanceof Error
        ? error.message
        : "The image library could not be loaded.";
  }
}

function renderMedia(): void {
  mediaGrid.replaceChildren();
  mediaEmpty.hidden = mediaItems.length > 0;
  for (const item of mediaItems) {
    const wrapper = document.createElement("div");
    wrapper.className = "admin-media-item";
    wrapper.setAttribute(
      "aria-selected",
      selectedMedia?.filename === item.filename ? "true" : "false",
    );

    const choose = document.createElement("button");
    choose.type = "button";
    choose.className = "admin-media-select";
    choose.setAttribute(
      "aria-pressed",
      selectedMedia?.filename === item.filename ? "true" : "false",
    );
    choose.addEventListener("click", () => selectMediaItem(item));

    const image = document.createElement("img");
    if (isAllowedLibraryImage(item.url, mediaSlug)) {
      image.src = item.url;
    }
    image.alt = item.filename;
    image.loading = "lazy";
    image.decoding = "async";

    const meta = document.createElement("span");
    meta.className = "admin-media-item__meta";
    const name = document.createElement("span");
    name.textContent = item.filename;
    const details = document.createElement("span");
    const dimensions =
      item.width && item.height ? `${item.width}×${item.height} · ` : "";
    details.textContent = `${dimensions}${formatBytes(item.size)}`;
    meta.append(name, details);
    choose.append(image, meta);

    const actions = document.createElement("div");
    actions.className = "admin-media-item__actions";
    const replace = document.createElement("button");
    replace.type = "button";
    replace.className = "admin-button";
    replace.textContent = "Replace";
    replace.addEventListener("click", () => {
      if (uploading) return;
      replaceTarget = item;
      replaceFile.click();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "admin-button admin-button--danger";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => {
      void deleteMedia(item);
    });
    actions.append(replace, remove);
    wrapper.append(choose, actions);
    mediaGrid.append(wrapper);
  }
  updateMediaScopeButtons();
}

function selectMediaItem(item: MediaInfo): void {
  selectedMedia = item;
  renderMedia();
  mediaAlt.focus();
}

function useSelectedMedia(): void {
  if (uploading) return;
  if (!selectedMedia) {
    mediaStatus.textContent = "Choose an image first.";
    return;
  }
  const alt = mediaAlt.value.trim();
  if (!alt) {
    mediaStatus.textContent =
      "Alt text is required. Describe what the image shows.";
    mediaAlt.focus();
    return;
  }
  if (mediaPurpose === "cover") {
    coverImageInput.value = selectedMedia.url;
    coverAltInput.value = alt;
    renderCover();
    mediaDialog.close();
    markDirty();
    setStatus("Cover image selected. Save the article to keep it.", "warning");
    return;
  }
  const caption = mediaCaption.value.trim();
  insertAtCursor(buildFigure(selectedMedia, alt, caption));
  mediaDialog.close();
  markDirty();
  setStatus(
    "Image inserted. Save the article to keep the reference.",
    "warning",
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clearUploadQueue(): void {
  uploadQueue = [];
  uploadQueueElement.replaceChildren();
  mediaFiles.value = "";
}

function queueFile(file: File): void {
  if (!file.type.startsWith("image/")) {
    mediaStatus.textContent = `${file.name} is not an image.`;
    return;
  }
  if (file.size > MAX_MEDIA_BYTES) {
    mediaStatus.textContent = `${file.name} is larger than 8 MB.`;
    return;
  }
  if (uploadQueue.length >= MAX_MEDIA_PER_UPLOAD) {
    mediaStatus.textContent = `Upload at most ${MAX_MEDIA_PER_UPLOAD} images at a time.`;
    return;
  }
  const fragment = uploadRowTemplate.content.cloneNode(
    true,
  ) as DocumentFragment;
  const row = fragment.querySelector<HTMLDivElement>(".admin-upload-row");
  const name = fragment.querySelector<HTMLParagraphElement>(
    ".admin-upload-row__name",
  );
  const alt = fragment.querySelector<HTMLInputElement>("[data-upload-alt]");
  const caption = fragment.querySelector<HTMLInputElement>(
    "[data-upload-caption]",
  );
  const remove = fragment.querySelector<HTMLButtonElement>(
    "[data-upload-remove]",
  );
  if (!row || !name || !alt || !caption || !remove) return;
  name.textContent = file.name;
  const queued: QueuedUpload = { file, row, alt, caption };
  remove.addEventListener("click", () => {
    uploadQueue = uploadQueue.filter((entry) => entry !== queued);
    row.remove();
  });
  uploadQueue.push(queued);
  uploadQueueElement.append(row);
}

async function uploadQueued(): Promise<void> {
  if (uploading || !mediaSlug) return;
  if (!scopeAllowed(mediaScope)) {
    mediaStatus.textContent = "This media library is not writable yet.";
    return;
  }
  if (uploadQueue.length === 0) {
    mediaStatus.textContent = "Choose one or more images first.";
    return;
  }
  for (const entry of uploadQueue) {
    if (!entry.alt.value.trim()) {
      mediaStatus.textContent = `Add alt text for ${entry.file.name}.`;
      entry.alt.focus();
      return;
    }
  }
  const slug = mediaSlug;
  const scope = mediaScope;
  uploading = true;
  uploadButton.disabled = true;
  updateMediaScopeButtons();
  let lastUploaded: string | undefined;
  try {
    for (const entry of [...uploadQueue]) {
      mediaStatus.textContent = `Uploading ${entry.file.name}…`;
      const data = new FormData();
      data.set("file", entry.file);
      data.set("scope", scope);
      data.set("alt", entry.alt.value.trim());
      if (entry.caption.value.trim()) {
        data.set("caption", entry.caption.value.trim());
      }
      const result = await apiForm<MediaUploadResult>(
        `${CMS_API}/articles/${encodeURIComponent(slug)}/media`,
        data,
      );
      lastUploaded = result.media.filename;
      entry.row.remove();
      uploadQueue = uploadQueue.filter((item) => item !== entry);
      showDeployment(result.deployment, result.commit?.commitSha);
      if (result.warnings.length > 0) {
        mediaStatus.textContent = result.warnings.join(" ");
      }
    }
    mediaFiles.value = "";
    await refreshMedia(scope, lastUploaded);
    setStatus(
      "Image upload committed. Save the article to keep its reference.",
      "warning",
    );
  } catch (error) {
    mediaStatus.textContent =
      error instanceof Error ? error.message : "The upload failed.";
  } finally {
    uploading = false;
    uploadButton.disabled = false;
    updateMediaScopeButtons();
  }
}

async function replaceMediaFile(file: File): Promise<void> {
  const target = replaceTarget;
  replaceTarget = null;
  replaceFile.value = "";
  if (!target || uploading) return;
  if (!scopeAllowed(mediaScope)) {
    mediaStatus.textContent = "This media library is not writable yet.";
    return;
  }
  if (file.size > MAX_MEDIA_BYTES) {
    mediaStatus.textContent = "Replacement images must be 8 MB or smaller.";
    return;
  }
  const oldExtension = target.filename.split(".").pop()?.toLowerCase() ?? "";
  const newExtension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const normalize = (value: string) => (value === "jpeg" ? "jpg" : value);
  if (normalize(oldExtension) !== normalize(newExtension)) {
    mediaStatus.textContent =
      "A replacement must use the same image format as the original.";
    return;
  }
  const confirmed = await askConfirm({
    title: "Replace this image?",
    message: `Replace ${target.filename} in place. The URL stays the same, so published references keep working.`,
    acceptLabel: "Replace image",
    danger: true,
  });
  if (!confirmed) return;
  const slug = mediaSlug;
  const scope = mediaScope;
  uploading = true;
  uploadButton.disabled = true;
  updateMediaScopeButtons();
  mediaStatus.textContent = `Replacing ${target.filename}…`;
  try {
    const data = new FormData();
    data.set("file", file);
    data.set("scope", scope);
    data.set("alt", mediaAlt.value.trim() || "Replacement image");
    data.set("replacePath", target.path);
    data.set("confirmReplace", "true");
    const result = await apiForm<MediaUploadResult>(
      `${CMS_API}/articles/${encodeURIComponent(slug)}/media`,
      data,
    );
    showDeployment(result.deployment, result.commit?.commitSha);
    await refreshMedia(scope, result.media.filename);
    setStatus("Image replaced.", "success");
  } catch (error) {
    mediaStatus.textContent =
      error instanceof Error
        ? error.message
        : "The image could not be replaced.";
  } finally {
    uploading = false;
    uploadButton.disabled = false;
    updateMediaScopeButtons();
  }
}

async function deleteMedia(item: MediaInfo): Promise<void> {
  if (uploading) return;
  const confirmed = await askConfirm({
    title: "Delete this image?",
    message: `Delete ${item.filename} from the ${mediaScope} library. The commit is permanent. Referenced images are protected by the server.`,
    acceptLabel: "Delete image",
    danger: true,
    requireText: item.filename,
    inputCaption: `Type ${item.filename} to delete`,
  });
  if (!confirmed) return;
  const slug = mediaSlug;
  const scope = mediaScope;
  mediaStatus.textContent = `Deleting ${item.filename}…`;
  try {
    const result = await apiJson<DeleteResult>(
      `${CMS_API}/articles/${encodeURIComponent(slug)}/media`,
      "DELETE",
      {
        scope,
        filename: item.filename,
        confirmFilename: item.filename,
      },
    );
    showDeployment(result.deployment, result.commit.commitSha);
    await refreshMedia(scope);
    setStatus("Image deleted.", "success");
  } catch (error) {
    mediaStatus.textContent =
      error instanceof Error
        ? error.message
        : "The image could not be deleted.";
  }
}

async function askConfirm(options: {
  title: string;
  message: string;
  acceptLabel: string;
  danger?: boolean;
  requireText?: string;
  inputCaption?: string;
}): Promise<boolean> {
  if (confirmDialog.open) confirmDialog.close();
  confirmTitle.textContent = options.title;
  confirmMessage.textContent = options.message;
  confirmAccept.textContent = options.acceptLabel;
  confirmAccept.className = `admin-button ${
    options.danger ? "admin-button--danger" : "admin-button--primary"
  }`;
  confirmError.hidden = true;
  confirmInput.value = "";
  confirmInputLabel.hidden = !options.requireText;
  confirmInputCaption.textContent = options.inputCaption ?? "";
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      confirmDialog.close();
      resolve(value);
    };
    const onClose = () => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    };
    confirmDialog.addEventListener("close", onClose, { once: true });
    confirmAccept.onclick = () => {
      if (
        options.requireText &&
        confirmInput.value.trim() !== options.requireText
      ) {
        confirmError.textContent = "The text does not match. Type it exactly.";
        confirmError.hidden = false;
        confirmInput.focus();
        return;
      }
      finish(true);
    };
    confirmDialog.showModal();
    if (options.requireText) {
      confirmInput.focus();
    } else {
      confirmAccept.focus();
    }
  });
}

async function askDeleteFile(slug: string): Promise<DeleteChoice | null> {
  if (!current) return null;
  if (deleteDialog.open) deleteDialog.close();
  deleteLocations.replaceChildren();
  const order: ArticleLocation[] = ["published", "draft", "archived"];
  let defaultChoice: ArticleLocation | null = null;
  for (const location of order) {
    const info = current.locations[location];
    if (!info) continue;
    if (!defaultChoice) defaultChoice = location;
    const label = document.createElement("label");
    label.className = "admin-check";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "delete-location";
    radio.value = location;
    if (location === (currentLocation ?? defaultChoice)) radio.checked = true;
    const text = document.createElement("span");
    text.textContent = `${locationLabel(location)} — ${info.path}`;
    label.append(radio, text);
    deleteLocations.append(label);
  }
  const first = deleteLocations.querySelector<HTMLInputElement>(
    'input[name="delete-location"]',
  );
  if (
    first &&
    !deleteLocations.querySelector('input[name="delete-location"]:checked')
  ) {
    first.checked = true;
  }
  deleteSlugLabel.textContent = slug;
  deleteConfirm.value = "";
  deleteError.hidden = true;
  return new Promise<DeleteChoice | null>((resolve) => {
    let settled = false;
    const finish = (value: DeleteChoice | null) => {
      if (settled) return;
      settled = true;
      deleteDialog.close();
      resolve(value);
    };
    const onClose = () => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    };
    deleteDialog.addEventListener("close", onClose, { once: true });
    deleteAccept.onclick = () => {
      const selected = deleteLocations.querySelector<HTMLInputElement>(
        'input[name="delete-location"]:checked',
      );
      if (!selected) {
        deleteError.textContent = "Choose which file to delete.";
        deleteError.hidden = false;
        return;
      }
      if (deleteConfirm.value.trim() !== slug) {
        deleteError.textContent = "The slug does not match. Type it exactly.";
        deleteError.hidden = false;
        deleteConfirm.focus();
        return;
      }
      const info = current?.locations[selected.value as ArticleLocation];
      if (!info) {
        deleteError.textContent = "That file is no longer available.";
        deleteError.hidden = false;
        return;
      }
      finish({ location: selected.value as ArticleLocation, sha: info.sha });
    };
    deleteDialog.showModal();
    deleteConfirm.focus();
  });
}

function bindDialogs(): void {
  for (const dialog of [confirmDialog, deleteDialog]) {
    for (const button of Array.from(
      dialog.querySelectorAll<HTMLButtonElement>('button[value="cancel"]'),
    )) {
      button.type = "button";
      button.addEventListener("click", () => dialog.close());
    }
    dialog.querySelector("form")?.addEventListener("submit", (event) => {
      event.preventDefault();
    });
  }
  confirmAccept.type = "button";
  deleteAccept.type = "button";
  confirmInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      confirmAccept.click();
    }
  });
  deleteConfirm.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      deleteAccept.click();
    }
  });
  confirmDialog.addEventListener("cancel", () => {
    confirmAccept.onclick = null;
  });
  deleteDialog.addEventListener("cancel", () => {
    deleteAccept.onclick = null;
  });
}

function bindEvents(): void {
  schedulePreview(0);
  bindDialogs();
  authReload.addEventListener("click", () => window.location.reload());
  refreshArticlesButton.addEventListener("click", () => {
    if (saving) return;
    setStatus("Refreshing articles…");
    void loadArticles()
      .then(() => setStatus("Article list refreshed."))
      .catch((error) => handleApiError(error, "global"));
  });
  newArticleButton.addEventListener("click", prepareNewArticle);
  articleSearch.addEventListener("input", renderArticleList);
  articleFilter.addEventListener("change", renderArticleList);

  form.addEventListener("input", (event) => {
    const target = event.target;
    if (target === slugInput) slugTouched = true;
    if (target === titleInput && !currentSlug && !slugTouched) {
      slugInput.value = slugify(titleInput.value);
    }
    if (
      target === slugInput ||
      target === coverImageInput ||
      target === coverAltInput
    ) {
      renderCover();
    }
    markDirty();
  });
  form.addEventListener("change", () => markDirty());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void save("draft");
  });
  slugInput.addEventListener("blur", () => {
    const normalized = slugify(slugInput.value);
    if (normalized && normalized !== slugInput.value) {
      slugInput.value = normalized;
      slugInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  locationSelect.addEventListener("change", () => {
    if (!currentSlug || saving) return;
    const location = locationSelect.value as ArticleLocation;
    if (!location || location === currentLocation) return;
    if (dirty) persistRecovery();
    void selectArticle(currentSlug, location);
  });

  addReferenceButton.addEventListener("click", () => addReference());
  coverChoose.addEventListener("click", () => openMedia("cover"));
  coverClear.addEventListener("click", () => {
    coverImageInput.value = "";
    coverAltInput.value = "";
    renderCover();
    markDirty();
  });

  publishButton.addEventListener("click", () => void save("publish"));
  archiveButton.addEventListener("click", () => void archiveArticle());
  deleteButton.addEventListener("click", () => void deleteFile());
  exportButton.addEventListener("click", () => void exportMarkdown());
  importTrigger.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", () => {
    const file = importFile.files?.[0];
    if (file) void importMarkdown(file);
  });
  checkDeploymentButton.addEventListener("click", () => void checkDeployment());

  for (const button of Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-view]"),
  )) {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      if (view === "write" || view === "split" || view === "preview") {
        setEditorView(view);
      }
    });
  }
  for (const button of Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-format]"),
  )) {
    button.addEventListener("click", () => {
      const format = button.dataset.format;
      if (format) applyFormat(format);
    });
  }

  mediaClose.addEventListener("click", () => mediaDialog.close());
  for (const button of Array.from(
    mediaDialog.querySelectorAll<HTMLButtonElement>("[data-media-scope]"),
  )) {
    button.addEventListener("click", () => {
      if (uploading) return;
      const scope = button.dataset.mediaScope;
      if (scope !== "draft" && scope !== "published") return;
      mediaScope = scope;
      clearUploadQueue();
      updateMediaScopeButtons();
      void refreshMedia(scope);
    });
  }
  mediaFiles.addEventListener("change", () => {
    for (const file of Array.from(mediaFiles.files ?? [])) queueFile(file);
    mediaFiles.value = "";
  });
  mediaUploadForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void uploadQueued();
  });
  mediaUse.addEventListener("click", useSelectedMedia);
  replaceFile.addEventListener("change", () => {
    const file = replaceFile.files?.[0];
    if (file) void replaceMediaFile(file);
  });

  recoveryRestore.addEventListener("click", () => {
    if (!recovery) return;
    applySnapshot(recovery.snapshot);
    slugTouched = Boolean(recovery.snapshot.slug);
    recoveryBanner.hidden = true;
    recovery = null;
    markDirty();
    setStatus("Local recovery restored. Review it before saving.", "warning");
  });
  recoveryDiscard.addEventListener("click", () => {
    window.localStorage.removeItem(recoveryKey());
    recovery = null;
    recoveryBanner.hidden = true;
    clearLocalSaveMessage();
    setStatus("Local recovery discarded.");
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (!saveDraftButton.disabled && !form.hidden) void save("draft");
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (!dirty) return;
    persistRecovery();
    event.preventDefault();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && dirty) persistRecovery();
  });
}

function init(): void {
  bindEvents();
  void start();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
