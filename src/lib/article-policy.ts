export interface ArticleLike {
  id: string;
  data: {
    title: string;
    slug: string;
    status: "draft" | "published";
    publishedAt?: Date;
    topics: readonly string[];
  };
}

export function isLiveArticle(article: ArticleLike, now: Date): boolean {
  return (
    article.data.status === "published" &&
    article.data.publishedAt !== undefined &&
    article.data.publishedAt.getTime() <= now.getTime()
  );
}

export function assertUniqueSlugs(articles: readonly ArticleLike[]): void {
  const bySlug = new Map<string, string[]>();
  for (const article of articles) {
    const ids = bySlug.get(article.data.slug) ?? [];
    ids.push(article.id);
    bySlug.set(article.data.slug, ids);
  }
  for (const [slug, ids] of bySlug) {
    if (ids.length > 1) {
      throw new Error(
        `Duplicate article slug "${slug}" used by: ${ids.join(", ")}. Article slugs must be unique; change the slug field in one of these entries.`,
      );
    }
  }
}

export function compareArticles(a: ArticleLike, b: ArticleLike): number {
  const aTime = a.data.publishedAt?.getTime();
  const bTime = b.data.publishedAt?.getTime();
  if (aTime === undefined && bTime === undefined) {
    return compareSlug(a, b);
  }
  if (aTime === undefined) return 1;
  if (bTime === undefined) return -1;
  if (aTime !== bTime) return bTime - aTime;
  return compareSlug(a, b);
}

function compareSlug(a: ArticleLike, b: ArticleLike): number {
  if (a.data.slug < b.data.slug) return -1;
  if (a.data.slug > b.data.slug) return 1;
  return 0;
}

export interface AdjacentArticles<A extends ArticleLike> {
  previous: A | null;
  next: A | null;
}

export function getAdjacentArticles<A extends ArticleLike>(
  article: A,
  ordered: readonly A[],
): AdjacentArticles<A> {
  const index = ordered.findIndex(
    (entry) => entry.data.slug === article.data.slug,
  );
  if (index === -1) {
    return { previous: null, next: null };
  }
  return {
    previous: index > 0 ? ordered[index - 1] : null,
    next: index < ordered.length - 1 ? ordered[index + 1] : null,
  };
}

export function getRelatedArticles<A extends ArticleLike>(
  article: A,
  ordered: readonly A[],
  limit = 2,
): A[] {
  return ordered
    .filter((candidate) => {
      if (candidate.data.slug === article.data.slug) return false;
      const candidateTopics: readonly string[] = candidate.data.topics;
      const articleTopics: readonly string[] = article.data.topics;
      return candidateTopics.some((topic) => articleTopics.includes(topic));
    })
    .slice(0, limit);
}

export function filterByTopic<A extends ArticleLike>(
  articles: readonly A[],
  topic: string,
): A[] {
  return articles.filter((article) => {
    const topics: readonly string[] = article.data.topics;
    return topics.includes(topic);
  });
}

export interface YearGroup<A extends ArticleLike> {
  year: number;
  articles: A[];
}

export function groupArticlesByYear<A extends ArticleLike>(
  articles: readonly A[],
): YearGroup<A>[] {
  const byYear = new Map<number, A[]>();
  for (const article of articles) {
    const publishedAt = article.data.publishedAt;
    if (!publishedAt) continue;
    const year = publishedAt.getUTCFullYear();
    const bucket = byYear.get(year);
    if (bucket) {
      bucket.push(article);
    } else {
      byYear.set(year, [article]);
    }
  }
  return [...byYear.entries()]
    .sort(([yearA], [yearB]) => yearB - yearA)
    .map(([year, group]) => ({ year, articles: group }));
}
