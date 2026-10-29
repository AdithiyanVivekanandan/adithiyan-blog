import type { APIRoute } from "astro";

import { AUTHOR, SITE_DESCRIPTION, SITE_LANGUAGE, SITE_TITLE } from "../consts";
import { getPublishedArticles } from "../lib/articles";
import { topicLabel } from "../lib/topics";

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export const GET: APIRoute = async ({ site }) => {
  if (!site) {
    throw new Error("astro.config.mjs must define site to generate rss.xml");
  }

  const articles = await getPublishedArticles();
  const siteHref = site.href.endsWith("/") ? site.href : `${site.href}/`;
  const selfHref = new URL("rss.xml", siteHref).href;
  const newest = articles[0]?.data.publishedAt;
  const year = new Date().getUTCFullYear();

  const items = articles
    .map((article) => {
      const url = new URL(`articles/${article.data.slug}/`, siteHref).href;
      const pubDate = article.data.publishedAt?.toUTCString() ?? "";
      return [
        "    <item>",
        `      <title>${escapeXml(article.data.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        `      <description>${escapeXml(article.data.description)}</description>`,
        ...article.data.topics.map(
          (topic) =>
            `      <category>${escapeXml(topicLabel(topic))}</category>`,
        ),
        `      <pubDate>${pubDate}</pubDate>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(SITE_TITLE)}</title>`,
    `    <link>${siteHref}</link>`,
    `    <description>${escapeXml(SITE_DESCRIPTION)}</description>`,
    `    <language>${SITE_LANGUAGE}</language>`,
    `    <copyright>© ${year} ${escapeXml(AUTHOR)}</copyright>`,
    "    <generator>Astro</generator>",
    "    <ttl>60</ttl>",
    newest
      ? `    <lastBuildDate>${newest.toUTCString()}</lastBuildDate>`
      : null,
    `    <atom:link href="${selfHref}" rel="self" type="application/rss+xml"/>`,
    items,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
};
