import { SignJWT, importPKCS8 } from "jose";

import { CmsError } from "./errors.ts";
import type {
  CommitResult,
  FileChange,
  GitHubGateway,
  RepoEntry,
  RepoRawFile,
  RepoTextFile,
} from "./types.ts";
import {
  assertSafeRelativePath,
  base64ToBytes,
  bytesToBase64,
} from "./text.ts";

const API_VERSION = "2022-11-28";
const ALLOWED_PREFIXES = ["src/content/articles/", "drafts/", "public/images/"];

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCacheEntry>();
const pemCache = new Map<string, CryptoKey>();

export interface GitHubClientOptions {
  appId: string;
  privateKey: string;
  installationId: string;
  owner: string;
  repo: string;
  branch: string;
  fetchImpl?: typeof fetch;
  apiBase?: string;
}

interface GitHubTreeEntry {
  path?: string;
  mode?: string;
  type?: string;
  sha?: string;
  size?: number;
  url?: string;
}

interface GitHubContentEntry {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: string;
}

interface GitHubTree {
  sha: string;
  truncated?: boolean;
  tree: GitHubTreeEntry[];
}

function assertAllowedRepoPath(path: string): string {
  const safe = assertSafeRelativePath(path);
  if (!ALLOWED_PREFIXES.some((prefix) => safe.startsWith(prefix))) {
    throw new CmsError(
      500,
      "internal_error",
      "The CMS attempted to write outside its allowed repository paths.",
    );
  }
  return safe;
}

function encodeRepoPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function encodeRef(ref: string): string {
  return ref.split("/").map(encodeURIComponent).join("/");
}

function normalizePem(value: string): string {
  return value.replace(/\\n/g, "\n").trim();
}

function encodeDerLength(length: number): Uint8Array {
  if (length < 0x80) return new Uint8Array([length]);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function derWrap(tag: number, value: Uint8Array): Uint8Array {
  const length = encodeDerLength(value.length);
  const result = new Uint8Array(1 + length.length + value.length);
  result[0] = tag;
  result.set(length, 1);
  result.set(value, 1 + length.length);
  return result;
}

function pemBody(pem: string): string {
  return pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
}

function pkcs1ToPkcs8(pem: string): string {
  const body = pemBody(pem);
  if (!body) throw new Error("The GitHub App private key is empty.");
  const pkcs1 = base64ToBytes(body);
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const rsaAlgorithm = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
    0x01, 0x05, 0x00,
  ]);
  const privateKey = derWrap(0x04, pkcs1);
  const outer = new Uint8Array(
    version.length + rsaAlgorithm.length + privateKey.length,
  );
  outer.set(version, 0);
  outer.set(rsaAlgorithm, version.length);
  outer.set(privateKey, version.length + rsaAlgorithm.length);
  const result = derWrap(0x30, outer);
  const encoded = bytesToBase64(result)
    .replace(/(.{64})/g, "$1\n")
    .trim();
  return `-----BEGIN PRIVATE KEY-----\n${encoded}\n-----END PRIVATE KEY-----`;
}

function normalizePrivateKey(pem: string): string {
  const normalized = normalizePem(pem);
  if (normalized.includes("BEGIN PRIVATE KEY")) return normalized;
  if (normalized.includes("BEGIN RSA PRIVATE KEY")) {
    return pkcs1ToPkcs8(normalized);
  }
  throw new CmsError(
    503,
    "not_configured",
    "GITHUB_APP_PRIVATE_KEY must be a PEM-encoded RSA private key.",
  );
}

async function loadPrivateKey(pem: string): Promise<CryptoKey> {
  const normalized = normalizePrivateKey(pem);
  const cached = pemCache.get(normalized);
  if (cached) return cached;
  try {
    const key = await importPKCS8(normalized, "RS256");
    pemCache.set(normalized, key);
    return key;
  } catch (error) {
    throw new CmsError(
      503,
      "not_configured",
      "The GitHub App private key could not be parsed. Convert it to PKCS#8 if needed.",
      { cause: error },
    );
  }
}

export async function computeGitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const combined = new Uint8Array(header.length + bytes.length);
  combined.set(header, 0);
  combined.set(bytes, header.length);
  const digest = await crypto.subtle.digest("SHA-1", combined);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === "string"
    ? new TextEncoder().encode(content)
    : content;
}

export class GitHubClient implements GitHubGateway {
  private readonly options: GitHubClientOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly apiBase: string;

  constructor(options: GitHubClientOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.apiBase = (options.apiBase ?? "https://api.github.com").replace(
      /\/+$/,
      "",
    );
  }

  private repoPath(path: string): string {
    return `/repos/${encodeURIComponent(this.options.owner)}/${encodeURIComponent(this.options.repo)}${path}`;
  }

  private async appJwt(): Promise<string> {
    const key = await loadPrivateKey(this.options.privateKey);
    return new SignJWT({})
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("9m")
      .setIssuer(this.options.appId)
      .sign(key);
  }

  private async installationToken(): Promise<string> {
    const cacheKey = `${this.options.appId}:${this.options.installationId}`;
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt - 60_000 > Date.now()) {
      return cached.token;
    }
    const jwt = await this.appJwt();
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.apiBase}/app/installations/${encodeURIComponent(this.options.installationId)}/access_tokens`,
        {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${jwt}`,
            "X-GitHub-Api-Version": API_VERSION,
            "User-Agent": "technical-fieldnotes-cms",
          },
        },
      );
    } catch (error) {
      throw new CmsError(
        502,
        "upstream_error",
        "Could not reach GitHub to authenticate the App.",
        { cause: error },
      );
    }
    if (!response.ok) {
      await this.throwForResponse(response, "installation token");
    }
    const payload = (await response.json()) as {
      token?: string;
      expires_at?: string;
    };
    if (!payload.token || !payload.expires_at) {
      throw new CmsError(
        502,
        "upstream_error",
        "GitHub returned an incomplete installation token.",
      );
    }
    const expiresAt = Date.parse(payload.expires_at);
    tokenCache.set(cacheKey, {
      token: payload.token,
      expiresAt: Number.isNaN(expiresAt) ? Date.now() + 5 * 60_000 : expiresAt,
    });
    return payload.token;
  }

  private async request(
    path: string,
    init: RequestInit = {},
    options: { allowNotFound?: boolean } = {},
  ): Promise<Response> {
    const token = await this.installationToken();
    const headers = new Headers(init.headers);
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/vnd.github+json");
    }
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-GitHub-Api-Version", API_VERSION);
    headers.set("User-Agent", "technical-fieldnotes-cms");
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.apiBase}${path}`, {
        ...init,
        headers,
      });
    } catch (error) {
      throw new CmsError(
        502,
        "upstream_error",
        "Could not reach GitHub. The change was not saved.",
        { cause: error },
      );
    }
    if (response.status === 404 && options.allowNotFound) return response;
    if (!response.ok) await this.throwForResponse(response, "request");
    return response;
  }

  private async throwForResponse(
    response: Response,
    operation: string,
  ): Promise<never> {
    const status = response.status;
    let message = "";
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") {
        message = payload.message.slice(0, 200);
      }
    } catch {
      message = "";
    }

    if (status === 401) {
      throw new CmsError(
        502,
        "upstream_error",
        "GitHub rejected the App credentials. Check the App ID, private key and installation.",
      );
    }
    if (status === 403 || status === 429) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      const reset = Number(response.headers.get("x-ratelimit-reset") ?? 0);
      if (remaining === "0" || status === 429) {
        const retryAfter =
          reset > 0 ? Math.max(1, Math.ceil(reset - Date.now() / 1000)) : 60;
        throw new CmsError(
          503,
          "rate_limited",
          "GitHub is rate limiting the CMS. Try again shortly.",
          { retryAfter },
        );
      }
      throw new CmsError(
        502,
        "upstream_error",
        `GitHub refused the ${operation}: ${message || "forbidden"}.`,
      );
    }
    if (status === 404) {
      throw new CmsError(
        404,
        "not_found",
        "That file was not found in GitHub.",
      );
    }
    if (status === 409 || status === 422) {
      throw new CmsError(
        409,
        "conflict",
        "GitHub rejected the change because the repository moved. Refresh and try again.",
        { details: { status } },
      );
    }
    if (status >= 500) {
      throw new CmsError(
        502,
        "upstream_error",
        "GitHub is unavailable right now. The change was not saved.",
      );
    }
    throw new CmsError(
      502,
      "upstream_error",
      `GitHub rejected the ${operation}${message ? `: ${message}` : "."}`,
      { details: { status } },
    );
  }

  async list(directory: string): Promise<RepoEntry[]> {
    const safe = assertSafeRelativePath(directory);
    if (!ALLOWED_PREFIXES.some((prefix) => `${safe}/`.startsWith(prefix))) {
      throw new CmsError(
        500,
        "internal_error",
        "The CMS attempted to read outside its allowed repository paths.",
      );
    }
    const response = await this.request(
      this.repoPath(
        `/contents/${encodeRepoPath(safe)}?ref=${encodeURIComponent(this.options.branch)}`,
      ),
      {},
      { allowNotFound: true },
    );
    if (response.status === 404) return [];
    const payload = (await response.json()) as
      GitHubContentEntry[] | GitHubContentEntry;
    const entries = Array.isArray(payload) ? payload : [payload];
    return entries
      .filter((entry) => entry && typeof entry.path === "string")
      .map((entry) => ({
        name: entry.name,
        path: entry.path,
        type: entry.type === "dir" ? "dir" : "file",
        sha: entry.sha,
        size: entry.size ?? 0,
      }));
  }

  async getText(path: string): Promise<RepoTextFile | null> {
    const safe = assertAllowedRepoPath(path);
    const response = await this.request(
      this.repoPath(
        `/contents/${encodeRepoPath(safe)}?ref=${encodeURIComponent(this.options.branch)}`,
      ),
      {},
      { allowNotFound: true },
    );
    if (response.status === 404) return null;
    const payload = (await response.json()) as GitHubContentEntry & {
      content?: string;
      encoding?: string;
    };
    if (payload.content && payload.encoding === "base64") {
      return {
        path: payload.path,
        sha: payload.sha,
        content: new TextDecoder().decode(base64ToBytes(payload.content)),
      };
    }
    const raw = await this.getRaw(safe);
    if (!raw) return null;
    return {
      path: payload.path,
      sha: payload.sha,
      content: new TextDecoder().decode(raw.bytes),
    };
  }

  async getRaw(path: string): Promise<RepoRawFile | null> {
    const safe = assertAllowedRepoPath(path);
    const response = await this.request(
      this.repoPath(
        `/contents/${encodeRepoPath(safe)}?ref=${encodeURIComponent(this.options.branch)}`,
      ),
      { headers: { Accept: "application/vnd.github.raw+json" } },
      { allowNotFound: true },
    );
    if (response.status === 404) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const etag = response.headers.get("etag") ?? "";
    return { path: safe, sha: etag.replace(/^W\/|"/g, ""), bytes };
  }

  private async getRef(): Promise<{
    commitSha: string;
    treeSha: string;
    commitUrl: string;
  }> {
    const response = await this.request(
      this.repoPath(`/git/ref/heads/${encodeRef(this.options.branch)}`),
    );
    const payload = (await response.json()) as {
      object?: { sha?: string; url?: string };
    };
    const commitSha = payload.object?.sha;
    if (!commitSha) {
      throw new CmsError(
        502,
        "upstream_error",
        "GitHub returned an incomplete branch reference.",
      );
    }
    return this.getCommit(commitSha);
  }

  private async getCommit(
    commitSha: string,
  ): Promise<{ commitSha: string; treeSha: string; commitUrl: string }> {
    const response = await this.request(
      this.repoPath(`/git/commits/${encodeURIComponent(commitSha)}`),
    );
    const payload = (await response.json()) as {
      sha?: string;
      html_url?: string;
      tree?: { sha?: string };
    };
    if (!payload.sha || !payload.tree?.sha) {
      throw new CmsError(
        502,
        "upstream_error",
        "GitHub returned an incomplete commit.",
      );
    }
    return {
      commitSha: payload.sha,
      treeSha: payload.tree.sha,
      commitUrl: payload.html_url ?? "",
    };
  }

  private async treeShaByPath(
    treeSha: string,
    paths: readonly string[],
  ): Promise<Map<string, string | undefined>> {
    const result = new Map<string, string | undefined>();
    const response = await this.request(
      this.repoPath(`/git/trees/${encodeURIComponent(treeSha)}?recursive=1`),
    );
    const tree = (await response.json()) as GitHubTree;
    if (!tree.truncated) {
      const byPath = new Map(
        (tree.tree ?? [])
          .filter((entry) => entry.type === "blob" && entry.path && entry.sha)
          .map((entry) => [entry.path as string, entry.sha as string]),
      );
      for (const path of paths) result.set(path, byPath.get(path));
      return result;
    }
    for (const path of paths) {
      const metadata = await this.getText(path);
      result.set(path, metadata?.sha);
    }
    return result;
  }

  async commit(changes: FileChange[], message: string): Promise<CommitResult> {
    if (changes.length === 0) {
      throw new CmsError(400, "bad_request", "There are no changes to save.");
    }
    if (message.trim().length === 0 || message.length > 200) {
      throw new CmsError(400, "bad_request", "The commit message is invalid.");
    }
    const paths = new Set<string>();
    const prepared: {
      path: string;
      bytes?: Uint8Array;
      blobSha?: string;
      delete: boolean;
      expectedSha?: string | null;
    }[] = [];

    for (const change of changes) {
      const path = assertAllowedRepoPath(change.path);
      if (paths.has(path)) {
        throw new CmsError(400, "bad_request", "Duplicate path in one commit.");
      }
      paths.add(path);
      if (change.delete) {
        prepared.push({
          path,
          delete: true,
          expectedSha: change.expectedSha,
        });
        continue;
      }
      if (change.content === undefined) {
        throw new CmsError(400, "bad_request", "A change has no content.");
      }
      const bytes = toBytes(change.content);
      prepared.push({
        path,
        bytes,
        blobSha: await computeGitBlobSha(bytes),
        delete: false,
        expectedSha: change.expectedSha,
      });
    }

    const head = await this.getRef();
    const currentShas = await this.treeShaByPath(
      head.treeSha,
      prepared.map((change) => change.path),
    );

    for (const change of prepared) {
      if (change.expectedSha === undefined) continue;
      const current = currentShas.get(change.path);
      if (change.expectedSha === null && current !== undefined) {
        throw new CmsError(
          409,
          "conflict",
          "That file already exists. Refresh before saving.",
          { details: { path: change.path, currentSha: current } },
        );
      }
      if (
        typeof change.expectedSha === "string" &&
        current !== change.expectedSha
      ) {
        throw new CmsError(
          409,
          "conflict",
          "The file changed since you opened it. Reload it before saving.",
          { details: { path: change.path, currentSha: current ?? null } },
        );
      }
    }

    const effective = prepared.filter((change) => {
      const current = currentShas.get(change.path);
      if (change.delete) return current !== undefined;
      return change.blobSha !== current;
    });

    if (effective.length === 0) {
      return {
        commitSha: head.commitSha,
        commitUrl: head.commitUrl,
        changed: [],
      };
    }

    const treeEntries: {
      path: string;
      mode: "100644";
      type: "blob";
      sha: string | null;
    }[] = [];

    for (const change of effective) {
      if (change.delete) {
        treeEntries.push({
          path: change.path,
          mode: "100644",
          type: "blob",
          sha: null,
        });
        continue;
      }
      const response = await this.request(this.repoPath("/git/blobs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: bytesToBase64(change.bytes as Uint8Array),
          encoding: "base64",
        }),
      });
      const blob = (await response.json()) as { sha?: string };
      if (!blob.sha) {
        throw new CmsError(
          502,
          "upstream_error",
          "GitHub did not return a blob SHA.",
        );
      }
      treeEntries.push({
        path: change.path,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      });
    }

    const treeResponse = await this.request(this.repoPath("/git/trees"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base_tree: head.treeSha,
        tree: treeEntries,
      }),
    });
    const tree = (await treeResponse.json()) as { sha?: string };
    if (!tree.sha) {
      throw new CmsError(
        502,
        "upstream_error",
        "GitHub did not return a tree SHA.",
      );
    }

    const commitResponse = await this.request(this.repoPath("/git/commits"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: [head.commitSha],
      }),
    });
    const commit = (await commitResponse.json()) as {
      sha?: string;
      html_url?: string;
    };
    if (!commit.sha) {
      throw new CmsError(
        502,
        "upstream_error",
        "GitHub did not return a commit SHA.",
      );
    }

    try {
      await this.request(
        this.repoPath(`/git/refs/heads/${encodeRef(this.options.branch)}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sha: commit.sha, force: false }),
        },
      );
    } catch (error) {
      if (error instanceof CmsError && error.status === 409) {
        throw new CmsError(
          409,
          "conflict",
          "The branch changed while you were saving. Refresh and try again.",
          { cause: error },
        );
      }
      throw error;
    }

    return {
      commitSha: commit.sha,
      commitUrl: commit.html_url ?? "",
      changed: effective.map((change) => change.path),
    };
  }
}

export function githubClientFromEnv(env: {
  [key: string]: string | undefined;
}): GitHubClient {
  const missing: string[] = [];
  const appId = env.GITHUB_APP_ID?.trim() ?? "";
  const privateKey = env.GITHUB_APP_PRIVATE_KEY ?? "";
  const installationId = env.GITHUB_APP_INSTALLATION_ID?.trim() ?? "";
  const owner = env.GITHUB_OWNER?.trim() ?? "";
  const repo = env.GITHUB_REPO?.trim() ?? "";
  const branch = env.GITHUB_BRANCH?.trim() ?? "main";
  if (!appId) missing.push("GITHUB_APP_ID");
  if (!privateKey) missing.push("GITHUB_APP_PRIVATE_KEY");
  if (!installationId) missing.push("GITHUB_APP_INSTALLATION_ID");
  if (!owner) missing.push("GITHUB_OWNER");
  if (!repo) missing.push("GITHUB_REPO");
  if (missing.length > 0) {
    throw new CmsError(
      503,
      "not_configured",
      `The GitHub App configuration is incomplete: ${missing.join(", ")}.`,
    );
  }
  return new GitHubClient({
    appId,
    privateKey,
    installationId,
    owner,
    repo,
    branch,
  });
}

export function resetGitHubCachesForTests(): void {
  tokenCache.clear();
  pemCache.clear();
}
