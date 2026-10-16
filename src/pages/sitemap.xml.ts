import type { APIRoute } from "astro";

import { filterByTopic } from "../lib/article-policy";
import { getPublishedArticles } from "../lib/articles";
import { APPROVED_TOPICS } from "../lib/topics";

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export const GET: APIRoute = async ({ site }) => {
  if (!site) {
    throw new Error(
      "astro.config.mjs must define site to generate sitemap.xml",
    );
  }

  const siteHref = site.href.endsWith("/") ? site.href : `${site.href}/`;
  const articles = await getPublishedArticles();
  const nonEmptyTopics = APPROVED_TOPICS.filter(
    (slug) => filterByTopic(articles, slug).length > 0,
  );

  const entries: { path: string; lastmod?: Date }[] = [
    { path: "/" },
    { path: "/articles/" },
    ...articles.map((article) => ({
      path: `/articles/${article.data.slug}/`,
      lastmod: article.data.updatedAt ?? article.data.publishedAt,
    })),
    { path: "/topics/" },
    ...nonEmptyTopics.map((slug) => ({ path: `/topics/${slug}/` })),
    { path: "/archive/" },
    { path: "/about/" },
  ];

  const urls = entries
    .map((entry) => {
      const loc = escapeXml(new URL(entry.path, siteHref).href);
      const lastmod = entry.lastmod
        ? `\n    <lastmod>${entry.lastmod.toISOString().slice(0, 10)}</lastmod>\n  `
        : "";
      return `  <url>\n    <loc>${loc}</loc>${lastmod}</url>`;
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
