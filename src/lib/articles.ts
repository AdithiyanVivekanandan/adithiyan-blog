import { getCollection, type CollectionEntry } from "astro:content";

import {
  assertUniqueSlugs,
  compareArticles,
  isLiveArticle,
} from "./article-policy";

export type ArticleEntry = CollectionEntry<"articles">;

export async function getAllArticles(): Promise<ArticleEntry[]> {
  const all = await getCollection("articles");
  assertUniqueSlugs(all);
  return all;
}

export async function getPublishedArticles(): Promise<ArticleEntry[]> {
  const now = new Date();
  return (await getAllArticles())
    .filter((article) => isLiveArticle(article, now))
    .sort(compareArticles);
}

export function readingTimeMinutes(body: string): number {
  const words = body.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatArticleDate(date: Date): string {
  return dateFormatter.format(date);
}

export function isoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
