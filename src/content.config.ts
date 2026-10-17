import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

import { ARTICLE_TYPES } from "./lib/article-type";
import { APPROVED_TOPICS } from "./lib/topics";

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
      topics: z.array(z.enum(APPROVED_TOPICS)).min(1),
      articleType: z.enum(ARTICLE_TYPES).optional(),
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
      if (article.status === "draft" && article.updatedAt) {
        ctx.addIssue({
          code: "custom",
          path: ["updatedAt"],
          message:
            "drafts must not declare updatedAt (draft dates must not leak)",
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
      if (article.updatedAt && article.updatedAt.getTime() > Date.now()) {
        ctx.addIssue({
          code: "custom",
          path: ["updatedAt"],
          message: "updatedAt must not be in the future",
        });
      }
    }),
});

export const collections = { articles };
