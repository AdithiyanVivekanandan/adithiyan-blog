import { CmsError } from "../../../../../src/lib/cms/errors.ts";
import {
  applyAdminHeaders,
  handleRequest,
} from "../../../../../src/lib/cms/http.ts";
import {
  articleService,
  requireIdentity,
  requireParam,
  type PagesContext,
} from "../../../../../src/lib/cms/pages.ts";
import type { ArticleLocation } from "../../../../../src/lib/cms/types.ts";

const LOCATIONS = new Set<ArticleLocation>(["published", "draft", "archived"]);

export const onRequestGet = (context: PagesContext): Promise<Response> =>
  handleRequest(context.request, async () => {
    await requireIdentity(context);
    const slug = requireParam(context, "slug");
    const value = new URL(context.request.url).searchParams.get("location");
    if (value && !LOCATIONS.has(value as ArticleLocation)) {
      throw new CmsError(400, "bad_request", "Unknown article location.");
    }
    const exported = await articleService(context).exportMarkdown(
      slug,
      value ? (value as ArticleLocation) : undefined,
    );
    const headers = new Headers({
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exported.filename}"`,
    });
    applyAdminHeaders(headers);
    return new Response(exported.source, { headers });
  });
