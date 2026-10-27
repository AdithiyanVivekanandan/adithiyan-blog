import type { AccessIdentity, CmsEnv } from "./auth.ts";
import { verifyAccessRequest } from "./auth.ts";
import { CmsError } from "./errors.ts";
import { githubClientFromEnv } from "./github.ts";
import { ArticleService } from "./articles.ts";

export interface PagesEnv extends CmsEnv {
  [key: string]: string | undefined;
}

export interface PagesContext {
  request: Request;
  env: PagesEnv;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  next: () => Promise<Response>;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export type PagesFunction = (
  context: PagesContext,
) => Response | Promise<Response>;

export function requireParam(context: PagesContext, name: string): string {
  const value = context.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new CmsError(400, "bad_request", `Missing route parameter ${name}.`);
  }
  return value;
}

export async function requireIdentity(
  context: PagesContext,
): Promise<AccessIdentity> {
  const existing = context.data.auth as AccessIdentity | undefined;
  if (existing) return existing;
  return verifyAccessRequest(context.request, context.env);
}

export function articleService(context: PagesContext): ArticleService {
  return new ArticleService({
    github: githubClientFromEnv(context.env),
    repoPrivateConfirmed: context.env.CMS_REPO_PRIVATE_CONFIRMED === "true",
  });
}
