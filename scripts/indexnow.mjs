import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const DIST_DIR = join(ROOT, "dist");
const HOST = "blog.adithiyan.me";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const KEY_PATTERN = /^[a-f0-9]{32}\.txt$/;

export async function loadKey() {
  let entries;
  try {
    entries = await readdir(PUBLIC_DIR);
  } catch {
    throw new Error(`cannot read ${PUBLIC_DIR}`);
  }

  const candidates = entries.filter((name) => KEY_PATTERN.test(name));
  if (candidates.length !== 1) {
    throw new Error(
      `expected exactly one IndexNow key file in public/, found ${candidates.length}`,
    );
  }

  const keyFile = candidates[0];
  const key = (await readFile(join(PUBLIC_DIR, keyFile), "utf8")).trim();
  if (`${key}.txt` !== keyFile) {
    throw new Error("IndexNow key filename does not match its contents");
  }

  return { key, keyFile };
}

export async function loadUrls() {
  let xml;
  try {
    xml = await readFile(join(DIST_DIR, "sitemap.xml"), "utf8");
  } catch {
    throw new Error("dist/sitemap.xml is missing; run `npm run build` first");
  }

  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
    match[1].trim(),
  );
  const unique = [...new Set(urls)];

  if (unique.length === 0) {
    throw new Error("sitemap.xml contains no URLs");
  }

  for (const url of unique) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.host !== HOST) {
      throw new Error(`refusing non-canonical IndexNow URL: ${url}`);
    }
    if (
      parsed.pathname.startsWith("/r1phun73r/") ||
      parsed.pathname === "/search/" ||
      parsed.pathname === "/404.html"
    ) {
      throw new Error(`refusing private or non-indexable URL: ${url}`);
    }
  }

  return unique;
}

export function buildPayload({ key, keyFile, urls }) {
  return {
    host: HOST,
    key,
    keyLocation: `https://${HOST}/${keyFile}`,
    urlList: urls,
  };
}

export async function verifyKeyLocation(payload, fetchImpl = fetch) {
  const response = await fetchImpl(payload.keyLocation, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(
      `The IndexNow key file is not public (HTTP ${response.status}). Deploy public/${payload.key}.txt before submitting URLs.`,
    );
  }
  const liveKey = (await response.text()).trim();
  if (liveKey !== payload.key) {
    throw new Error(
      "The live IndexNow key file does not match the local key. Deploy the current public key file.",
    );
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { key, keyFile } = await loadKey();
  const urls = await loadUrls();
  const payload = buildPayload({ key, keyFile, urls });

  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  await verifyKeyLocation(payload);

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.text()).trim();

  if (!response.ok) {
    throw new Error(
      `IndexNow rejected the submission (HTTP ${response.status})${body ? `: ${body}` : ""}`,
    );
  }

  console.log(
    `IndexNow accepted ${urls.length} URLs (HTTP ${response.status})${body ? `: ${body}` : ""}`,
  );
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
