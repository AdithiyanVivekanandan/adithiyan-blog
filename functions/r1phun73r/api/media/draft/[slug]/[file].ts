import {
  applyAdminHeaders,
  handleRequest,
} from "../../../../../../src/lib/cms/http.ts";
import {
  articleService,
  requireIdentity,
  requireParam,
  type PagesContext,
} from "../../../../../../src/lib/cms/pages.ts";

export const onRequestGet = (context: PagesContext): Promise<Response> =>
  handleRequest(context.request, async () => {
    await requireIdentity(context);
    const slug = requireParam(context, "slug");
    const filename = requireParam(context, "file");
    const media = await articleService(context).getDraftMedia(slug, filename);
    const headers = new Headers({
      "Content-Type": media.contentType,
      "Content-Length": String(media.bytes.length),
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cross-Origin-Resource-Policy": "same-origin",
    });
    applyAdminHeaders(headers);
    const body = media.bytes.buffer.slice(
      media.bytes.byteOffset,
      media.bytes.byteOffset + media.bytes.byteLength,
    ) as ArrayBuffer;
    return new Response(body, { headers });
  });
