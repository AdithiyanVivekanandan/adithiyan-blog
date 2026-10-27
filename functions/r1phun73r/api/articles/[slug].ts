import { requireWriteAuth } from "../../../../src/lib/cms/auth.ts";
import { deploymentStatusForCommit } from "../../../../src/lib/cms/cloudflare.ts";
import { MAX_WRITES_PER_MINUTE } from "../../../../src/lib/cms/constants.ts";
import { CmsError } from "../../../../src/lib/cms/errors.ts";
import {
  handleRequest,
  jsonResponse,
  readJson,
} from "../../../../src/lib/cms/http.ts";
import {
  articleService,
  requireIdentity,
  requireParam,
  type PagesContext,
} from "../../../../src/lib/cms/pages.ts";
import { enforceRateLimit } from "../../../../src/lib/cms/rate-limit.ts";
import type {
  ArticleLocation,
  SaveArticleRequest,
} from "../../../../src/lib/cms/types.ts";

const LOCATIONS = new Set<ArticleLocation>(["published", "draft", "archived"]);

function locationFrom(request: Request): ArticleLocation | undefined {
  const value = new URL(request.url).searchParams.get("location");
  if (!value) return undefined;
  if (!LOCATIONS.has(value as ArticleLocation)) {
    throw new CmsError(400, "bad_request", "Unknown article location.");
  }
  return value as ArticleLocation;
}

export const onRequestGet = (context: PagesContext): Promise<Response> =>
  handleRequest(context.request, async () => {
    await requireIdentity(context);
    const slug = requireParam(context, "slug");
    const detail = await articleService(context).get(
      slug,
      locationFrom(context.request),
    );
    return jsonResponse({ ok: true, data: detail });
  });

export const onRequestPut = (context: PagesContext): Promise<Response> =>
  handleRequest(context.request, async () => {
    const identity = await requireWriteAuth(context.request, context.env);
    enforceRateLimit(`${identity.email}:write`, MAX_WRITES_PER_MINUTE);
    const slug = requireParam(context, "slug");
    const body = await readJson<SaveArticleRequest>(context.request);
    if (body.frontmatter?.slug !== slug) {
      throw new CmsError(
        400,
        "validation_failed",
        "Changing an article's slug is not supported by the CMS. Create a new article instead.",
        { details: { field: "slug" } },
      );
    }
    const service = articleService(context);
    const result = await service.save(body);
    if (result.commit.changed.length > 0) {
      result.deployment = await deploymentStatusForCommit(
        context.env,
        result.commit.commitSha,
      );
    }
    return jsonResponse({ ok: true, data: result });
  });

export const onRequestDelete = (context: PagesContext): Promise<Response> =>
  handleRequest(context.request, async () => {
    const identity = await requireWriteAuth(context.request, context.env);
    enforceRateLimit(`${identity.email}:delete`, 10);
    const slug = requireParam(context, "slug");
    const search = new URL(context.request.url).searchParams;
    const location = locationFrom(context.request);
    if (!location) {
      throw new CmsError(400, "bad_request", "Choose which file to delete.");
    }
    const expectedSha = search.get("expectedSha") ?? "";
    const confirm = search.get("confirm") ?? "";
    const service = articleService(context);
    const result = await service.delete(slug, location, expectedSha, confirm);
    if (result.commit.changed.length > 0) {
      result.deployment = await deploymentStatusForCommit(
        context.env,
        result.commit.commitSha,
      );
    }
    return jsonResponse({ ok: true, data: result });
  });
