import { getCollection, type CollectionEntry } from "astro:content";

export type ArticleEntry = CollectionEntry<"articles">;

export async function getPublishedArticles(): Promise<ArticleEntry[]> {
  const published = await getCollection(
    "articles",
    ({ data }) => data.status === "published",
  );
  return published.sort(
    (a, b) => b.data.publishedAt!.getTime() - a.data.publishedAt!.getTime(),
  );
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
