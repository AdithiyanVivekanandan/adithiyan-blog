export const APPROVED_TOPICS = [
  "ai-engineering",
  "systems-tooling",
  "security-research",
  "reverse-engineering",
  "experiments-fieldnotes",
] as const;

export type TopicSlug = (typeof APPROVED_TOPICS)[number];

const TOPIC_LABELS: Record<TopicSlug, string> = {
  "ai-engineering": "AI Engineering",
  "systems-tooling": "Systems & Tooling",
  "security-research": "Security Research",
  "reverse-engineering": "Reverse Engineering",
  "experiments-fieldnotes": "Experiments & Fieldnotes",
};

export function topicLabel(slug: string): string {
  return TOPIC_LABELS[slug as TopicSlug] ?? slug;
}
