import {
  ARTICLE_TYPES,
  articleTypeLabel,
} from "../../../src/lib/article-type.ts";
import { APPROVED_TOPICS, topicLabel } from "../../../src/lib/topics.ts";
import { accessLogoutUrl, createCsrfToken } from "../../../src/lib/cms/auth.ts";
import { deploymentConfigured } from "../../../src/lib/cms/cloudflare.ts";
import { jsonResponse, handleRequest } from "../../../src/lib/cms/http.ts";
import {
  requireIdentity,
  type PagesContext,
} from "../../../src/lib/cms/pages.ts";
import type { CmsSession } from "../../../src/lib/cms/types.ts";

export const onRequestGet = (context: PagesContext): Promise<Response> =>
  handleRequest(context.request, async () => {
    const identity = await requireIdentity(context);
    const session: CmsSession = {
      email: identity.email,
      dev: identity.dev,
      csrfToken: await createCsrfToken(identity.email, context.env),
      logoutUrl: accessLogoutUrl(context.env),
      topics: APPROVED_TOPICS.map((slug) => ({
        slug,
        label: topicLabel(slug),
      })),
      articleTypes: ARTICLE_TYPES.map((slug) => ({
        slug,
        label: articleTypeLabel(slug),
      })),
      repoPrivateConfirmed: context.env.CMS_REPO_PRIVATE_CONFIRMED === "true",
      branch: context.env.GITHUB_BRANCH?.trim() || "main",
      deploymentConfigured: deploymentConfigured(context.env),
    };
    return jsonResponse({ ok: true, data: session });
  });
