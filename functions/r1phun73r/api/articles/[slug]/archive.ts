import { requireWriteAuth } from "../../../../../src/lib/cms/auth.ts";
import { deploymentStatusForCommit } from "../../../../../src/lib/cms/cloudflare.ts";
import { MAX_WRITES_PER_MINUTE } from "../../../../../src/lib/cms/constants.ts";
import {
  handleRequest,
  jsonResponse,
  readJson,
} from "../../../../../src/lib/cms/http.ts";
import {
  articleService,
  requireParam,
  type PagesContext,
} from "../../../../../src/lib/cms/pages.ts";
import { enforceRateLimit } from "../../../../../src/lib/cms/rate-limit.ts";

interface ArchiveRequest {
  expectedSha?: string;
  confirmSlug?: string;
}

export const onRequestPost = (context: PagesContext): Promise<Response> =>
  handleRequest(context.request, async () => {
    const identity = await requireWriteAuth(context.request, context.env);
    enforceRateLimit(`${identity.email}:archive`, MAX_WRITES_PER_MINUTE);
    const slug = requireParam(context, "slug");
    const body = await readJson<ArchiveRequest>(context.request);
    const service = articleService(context);
    const result = await service.archive(
      slug,
      body.expectedSha ?? "",
      body.confirmSlug ?? "",
    );
    if (result.commit.changed.length > 0) {
      result.deployment = await deploymentStatusForCommit(
        context.env,
        result.commit.commitSha,
      );
    }
    return jsonResponse({ ok: true, data: result });
  });
