import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  buildPayload,
  loadKey,
  loadUrls,
  verifyKeyLocation,
} from "../scripts/indexnow.mjs";

test("the IndexNow key file is publishable and self-consistent", async () => {
  const { key, keyFile } = await loadKey();

  assert.match(key, /^[a-f0-9]{32}$/);
  assert.equal(`${key}.txt`, keyFile);

  const publicFile = readFileSync(
    new URL(`../public/${keyFile}`, import.meta.url),
    "utf8",
  ).trim();
  const builtFile = readFileSync(
    new URL(`../dist/${keyFile}`, import.meta.url),
    "utf8",
  ).trim();

  assert.equal(publicFile, key);
  assert.equal(builtFile, key);
});

test("IndexNow receives only canonical sitemap URLs", async () => {
  const { key, keyFile } = await loadKey();
  const urls = await loadUrls();
  const payload = buildPayload({ key, keyFile, urls });

  assert.ok(urls.includes("https://blog.adithiyan.me/"));
  assert.ok(
    urls.includes(
      "https://blog.adithiyan.me/articles/understanding-windows-executables/",
    ),
  );
  assert.equal(new Set(urls).size, urls.length);
  assert.ok(urls.every((url) => new URL(url).protocol === "https:"));
  assert.ok(urls.every((url) => new URL(url).host === "blog.adithiyan.me"));
  assert.ok(!urls.some((url) => url.includes("/r1phun73r/")));
  assert.ok(!urls.some((url) => url.endsWith("/search/")));
  assert.ok(!urls.some((url) => url.includes("404")));
  assert.deepEqual(payload, {
    host: "blog.adithiyan.me",
    key,
    keyLocation: `https://blog.adithiyan.me/${keyFile}`,
    urlList: urls,
  });
});

test("IndexNow refuses to submit until the key file is live", async () => {
  const payload = {
    host: "blog.adithiyan.me",
    key: "a".repeat(32),
    keyLocation: `https://blog.adithiyan.me/${"a".repeat(32)}.txt`,
    urlList: ["https://blog.adithiyan.me/"],
  };

  await verifyKeyLocation(
    payload,
    async () => new Response(payload.key, { status: 200 }),
  );

  await assert.rejects(
    verifyKeyLocation(
      payload,
      async () => new Response("not found", { status: 404 }),
    ),
    /key file is not public/,
  );
  await assert.rejects(
    verifyKeyLocation(
      payload,
      async () => new Response("wrong-key", { status: 200 }),
    ),
    /does not match/,
  );
});
