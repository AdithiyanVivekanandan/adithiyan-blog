export const ARTICLE_TYPES = [
  "tutorial",
  "investigation",
  "experiment",
  "opinion",
  "fieldnote",
  "reference",
] as const;

export type ArticleType = (typeof ARTICLE_TYPES)[number];

const ARTICLE_TYPE_LABELS: Record<ArticleType, string> = {
  tutorial: "Tutorial",
  investigation: "Investigation",
  experiment: "Experiment",
  opinion: "Opinion",
  fieldnote: "Field note",
  reference: "Reference",
};

/**
 * Publications read as a field journal, so an article without an explicit
 * type is labelled "Field note" — the default voice of the publication.
 */
export function articleTypeLabel(articleType?: ArticleType): string {
  return articleType ? ARTICLE_TYPE_LABELS[articleType] : "Field note";
}
