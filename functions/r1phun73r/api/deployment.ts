import { deploymentStatusForCommit } from "../../../src/lib/cms/cloudflare.ts";
import { CmsError } from "../../../src/lib/cms/errors.ts";
import { handleRequest, jsonResponse } from "../../../src/lib/cms/http.ts";
import {
  requireIdentity,
  type PagesContext,
} from "../../../src/lib/cms/pages.ts";

export const onRequestGet = (context: PagesContext): Promise<Response> =>
  handleRequest(context.request, async () => {
    await requireIdentity(context);
    const sha = new URL(context.request.url).searchParams.get("sha") ?? "";
    if (!/^[0-9a-f]{40}$/i.test(sha)) {
      throw new CmsError(400, "bad_request", "A commit SHA is required.");
    }
    const deployment = await deploymentStatusForCommit(context.env, sha);
    return jsonResponse({ ok: true, data: { deployment } });
  });
