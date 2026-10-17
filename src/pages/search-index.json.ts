import type { APIRoute } from "astro";

import { getPublishedArticles } from "../lib/articles";
import { topicLabel } from "../lib/topics";

export interface SearchEntry {
  slug: string;
  title: string;
  description: string;
  topics: string[];
  date: string | null;
}

export const GET: APIRoute = async ({ site }) => {
  if (!site) {
    throw new Error(
      "astro.config.mjs must define site to generate search-index.json",
    );
  }

  const articles = await getPublishedArticles();
  const entries: SearchEntry[] = articles.map((article) => ({
    slug: article.data.slug,
    title: article.data.title,
    description: article.data.description,
    topics: article.data.topics.map((slug) => topicLabel(slug)),
    date: article.data.publishedAt?.toISOString().slice(0, 10) ?? null,
  }));

  const json = JSON.stringify({ site: site.href, articles: entries });

  return new Response(json, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
