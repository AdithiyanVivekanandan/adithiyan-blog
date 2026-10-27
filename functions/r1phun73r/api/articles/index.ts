import { requireWriteAuth } from "../../../../src/lib/cms/auth.ts";
import { deploymentStatusForCommit } from "../../../../src/lib/cms/cloudflare.ts";
import { MAX_WRITES_PER_MINUTE } from "../../../../src/lib/cms/constants.ts";
import {
  handleRequest,
  jsonResponse,
  readJson,
} from "../../../../src/lib/cms/http.ts";
import {
  articleService,
  requireIdentity,
  type PagesContext,
} from "../../../../src/lib/cms/pages.ts";
import { enforceRateLimit } from "../../../../src/lib/cms/rate-limit.ts";
import type { SaveArticleRequest } from "../../../../src/lib/cms/types.ts";

export const onRequestGet = (context: PagesContext): Promise<Response> =>
  handleRequest(context.request, async () => {
    await requireIdentity(context);
    const articles = await articleService(context).list();
    return jsonResponse({ ok: true, data: { articles } });
  });

export const onRequestPost = (context: PagesContext): Promise<Response> =>
  handleRequest(context.request, async () => {
    const identity = await requireWriteAuth(context.request, context.env);
    enforceRateLimit(`${identity.email}:write`, MAX_WRITES_PER_MINUTE);
    const body = await readJson<SaveArticleRequest>(context.request);
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
