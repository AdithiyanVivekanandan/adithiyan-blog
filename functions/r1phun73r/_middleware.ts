import { verifyAccessRequest } from "../../src/lib/cms/auth.ts";
import {
  errorResponse,
  htmlError,
  withAdminHeaders,
} from "../../src/lib/cms/http.ts";
import type { PagesContext } from "../../src/lib/cms/pages.ts";

export async function onRequest(context: PagesContext): Promise<Response> {
  const path = new URL(context.request.url).pathname;
  try {
    const identity = await verifyAccessRequest(context.request, context.env);
    context.data.auth = identity;
  } catch (error) {
    if (path.startsWith("/r1phun73r/api/")) {
      return errorResponse(error);
    }
    return htmlError(error);
  }

  const response = await context.next();
  return withAdminHeaders(response);
}
