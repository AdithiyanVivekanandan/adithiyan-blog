import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const approvedTopics = [
  "ai-engineering",
  "systems-tooling",
  "security-research",
  "reverse-engineering",
  "experiments-fieldnotes",
] as const;

const articles = defineCollection({
  loader: glob({ pattern: ["**/*.md"], base: "./src/content/articles" }),
  schema: z
    .object({
      title: z.string().trim().min(1).max(120),
      slug: z
        .string()
        .regex(
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
          "slug must be lowercase and URL-safe",
        ),
      description: z.string().trim().min(20).max(400),
      publishedAt: z.coerce.date().optional(),
      updatedAt: z.coerce.date().optional(),
      status: z.enum(["draft", "published"]),
      topics: z.array(z.enum(approvedTopics)).min(1),
      articleType: z
        .enum([
          "tutorial",
          "investigation",
          "experiment",
          "opinion",
          "fieldnote",
          "reference",
        ])
        .optional(),
      references: z
        .array(
          z.object({
            title: z.string().trim().min(1),
            url: z.url(),
            annotation: z.string().trim().min(1).optional(),
          }),
        )
        .optional(),
      technicalContext: z.string().trim().min(1).optional(),
      limitations: z.string().trim().min(1).optional(),
    })
    .superRefine((article, ctx) => {
      if (article.status === "published" && !article.publishedAt) {
        ctx.addIssue({
          code: "custom",
          path: ["publishedAt"],
          message: "published articles require a publishedAt date",
        });
      }
      if (article.status === "draft" && article.publishedAt) {
        ctx.addIssue({
          code: "custom",
          path: ["publishedAt"],
          message:
            "drafts must not declare publishedAt (draft dates must not leak)",
        });
      }
      if (
        article.publishedAt &&
        article.updatedAt &&
        article.updatedAt.getTime() < article.publishedAt.getTime()
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["updatedAt"],
          message: "updatedAt must not be earlier than publishedAt",
        });
      }
    }),
});

export const collections = { articles };
