import {
  AUTHOR,
  AUTHOR_GITHUB,
  SITE_DESCRIPTION,
  SITE_LANGUAGE,
  SITE_TITLE,
} from "../consts";
import { topicLabel } from "./topics";

export type StructuredDataNode = Record<string, unknown>;

interface BreadcrumbItem {
  name: string;
  path: string;
}

interface ArticleSeoInput {
  site: URL;
  slug: string;
  title: string;
  description: string;
  publishedAt: Date;
  updatedAt?: Date;
  coverImage?: string;
  topics: readonly string[];
  references?: readonly { title: string; url: string }[];
  wordCount: number;
  minutes: number;
}

interface CollectionArticle {
  slug: string;
  title: string;
}

function siteHref(site: URL): string {
  return site.href.endsWith("/") ? site.href : `${site.href}/`;
}

export function absoluteUrl(site: URL, path: string): string {
  return new URL(path, siteHref(site)).href;
}

function websiteId(site: URL): string {
  return absoluteUrl(site, "/#website");
}

function personId(site: URL): string {
  return absoluteUrl(site, "/#person");
}

function blogId(site: URL): string {
  return absoluteUrl(site, "/#blog");
}

export function baseStructuredData(site: URL): StructuredDataNode[] {
  return [
    {
      "@type": "Person",
      "@id": personId(site),
      name: AUTHOR,
      url: absoluteUrl(site, "/about/"),
      description: `Writes ${SITE_TITLE}, a personal technical publication about understanding systems.`,
      sameAs: [AUTHOR_GITHUB],
    },
    {
      "@type": "WebSite",
      "@id": websiteId(site),
      url: absoluteUrl(site, "/"),
      name: SITE_TITLE,
      description: SITE_DESCRIPTION,
      inLanguage: SITE_LANGUAGE,
      publisher: { "@id": personId(site) },
    },
    {
      "@type": "Blog",
      "@id": blogId(site),
      url: absoluteUrl(site, "/articles/"),
      name: SITE_TITLE,
      description: SITE_DESCRIPTION,
      inLanguage: SITE_LANGUAGE,
      publisher: { "@id": personId(site) },
      isPartOf: { "@id": websiteId(site) },
    },
  ];
}

export function articleStructuredData(
  input: ArticleSeoInput,
): StructuredDataNode {
  const {
    site,
    slug,
    title,
    description,
    publishedAt,
    updatedAt,
    coverImage,
    topics,
    references,
    wordCount,
    minutes,
  } = input;
  const url = absoluteUrl(site, `/articles/${slug}/`);
  const image = coverImage
    ? absoluteUrl(site, coverImage)
    : absoluteUrl(site, "/og.png");

  return {
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    url,
    headline: title,
    description,
    datePublished: publishedAt.toISOString(),
    ...(updatedAt ? { dateModified: updatedAt.toISOString() } : {}),
    author: { "@id": personId(site) },
    publisher: { "@id": personId(site) },
    image: [image],
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    isPartOf: { "@id": blogId(site) },
    inLanguage: SITE_LANGUAGE,
    articleSection: topicLabel(topics[0] ?? ""),
    keywords: topics.map((topic) => topicLabel(topic)).join(", "),
    about: topics.map((topic) => ({
      "@type": "Thing",
      name: topicLabel(topic),
    })),
    wordCount,
    timeRequired: `PT${minutes}M`,
    isAccessibleForFree: true,
    ...(references && references.length > 0
      ? {
          citation: references.map((reference) => ({
            "@type": "CreativeWork",
            name: reference.title,
            url: reference.url,
          })),
        }
      : {}),
  };
}

export function breadcrumbStructuredData(
  site: URL,
  items: readonly BreadcrumbItem[],
): StructuredDataNode {
  const pageUrl = absoluteUrl(site, items.at(-1)?.path ?? "/");

  return {
    "@type": "BreadcrumbList",
    "@id": `${pageUrl}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(site, item.path),
    })),
  };
}

export function collectionPageStructuredData(
  site: URL,
  input: {
    path: string;
    name: string;
    description: string;
    articles: readonly CollectionArticle[];
  },
): StructuredDataNode {
  const url = absoluteUrl(site, input.path);

  return {
    "@type": "CollectionPage",
    "@id": `${url}#collection`,
    url,
    name: input.name,
    description: input.description,
    isPartOf: { "@id": websiteId(site) },
    inLanguage: SITE_LANGUAGE,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.articles.length,
      itemListElement: input.articles.map((article, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: article.title,
        url: absoluteUrl(site, `/articles/${article.slug}/`),
      })),
    },
  };
}

export function topicDirectoryPageStructuredData(
  site: URL,
  input: {
    path: string;
    name: string;
    description: string;
    topics: readonly {
      slug: string;
      label: string;
      description: string;
      count: number;
    }[];
  },
): StructuredDataNode {
  const url = absoluteUrl(site, input.path);

  return {
    "@type": "CollectionPage",
    "@id": `${url}#collection`,
    url,
    name: input.name,
    description: input.description,
    isPartOf: { "@id": websiteId(site) },
    inLanguage: SITE_LANGUAGE,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.topics.length,
      itemListElement: input.topics.map((topic, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: topic.label,
        description: topic.description,
        url: absoluteUrl(site, `/topics/${topic.slug}/`),
        item: {
          "@type": "CollectionPage",
          name: `${topic.label} Articles`,
          description: `${topic.count} published ${topic.count === 1 ? "article" : "articles"}.`,
          url: absoluteUrl(site, `/topics/${topic.slug}/`),
        },
      })),
    },
  };
}

export function aboutPageStructuredData(
  site: URL,
  input: { name: string; description: string },
): StructuredDataNode {
  return {
    "@type": "AboutPage",
    "@id": `${absoluteUrl(site, "/about/")}#about`,
    url: absoluteUrl(site, "/about/"),
    name: input.name,
    description: input.description,
    isPartOf: { "@id": websiteId(site) },
    inLanguage: SITE_LANGUAGE,
    mainEntity: { "@id": personId(site) },
  };
}
