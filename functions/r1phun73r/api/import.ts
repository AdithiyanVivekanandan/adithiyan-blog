import { requireWriteAuth } from "../../../src/lib/cms/auth.ts";
import { MAX_WRITES_PER_MINUTE } from "../../../src/lib/cms/constants.ts";
import {
  handleRequest,
  jsonResponse,
  readJson,
} from "../../../src/lib/cms/http.ts";
import {
  articleService,
  type PagesContext,
} from "../../../src/lib/cms/pages.ts";
import { enforceRateLimit } from "../../../src/lib/cms/rate-limit.ts";

interface ImportRequest {
  source?: unknown;
}

export const onRequestPost = (context: PagesContext): Promise<Response> =>
  handleRequest(context.request, async () => {
    const identity = await requireWriteAuth(context.request, context.env);
    enforceRateLimit(`${identity.email}:import`, MAX_WRITES_PER_MINUTE);
    const body = await readJson<ImportRequest>(context.request);
    const result = await articleService(context).importMarkdown(body.source);
    return jsonResponse({ ok: true, data: result });
  });
