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

const TOPIC_DESCRIPTIONS: Record<TopicSlug, string> = {
  "ai-engineering":
    "Experiments, evaluations and implementation notes, with model and version, baselines, evaluation method and limitations stated.",
  "systems-tooling":
    "Build notes, debugging and environment setup, with OS and tool versions, commands, error conditions and verified outcomes.",
  "security-research":
    "Defensive analysis, tool evaluation and lab notes, with authorization scope, sanitized evidence and impact boundaries.",
  "reverse-engineering":
    "Static and dynamic analysis notes on binary behavior, with sample provenance, environment, observed behavior and confidence.",
  "experiments-fieldnotes":
    "Short discoveries, failed attempts and hypotheses, with confirmed facts, inference and unknowns clearly labeled.",
};

export function topicLabel(slug: string): string {
  return TOPIC_LABELS[slug as TopicSlug] ?? slug;
}

export function topicDescription(slug: TopicSlug): string {
  return TOPIC_DESCRIPTIONS[slug];
}
