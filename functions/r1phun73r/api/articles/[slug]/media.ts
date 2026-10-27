import { requireWriteAuth } from "../../../../../src/lib/cms/auth.ts";
import { deploymentStatusForCommit } from "../../../../../src/lib/cms/cloudflare.ts";
import {
  MAX_MEDIA_BYTES,
  MAX_WRITES_PER_MINUTE,
} from "../../../../../src/lib/cms/constants.ts";
import { CmsError } from "../../../../../src/lib/cms/errors.ts";
import {
  handleRequest,
  jsonResponse,
  readFormData,
  readJson,
} from "../../../../../src/lib/cms/http.ts";
import {
  articleService,
  requireIdentity,
  requireParam,
  type PagesContext,
} from "../../../../../src/lib/cms/pages.ts";
import { enforceRateLimit } from "../../../../../src/lib/cms/rate-limit.ts";

interface UploadFile {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

function isUploadFile(value: unknown): value is UploadFile {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as UploadFile).name === "string" &&
    typeof (value as UploadFile).size === "number" &&
    typeof (value as UploadFile).arrayBuffer === "function"
  );
}

function scopeValue(value: unknown): "draft" | "published" {
  if (value === "draft" || value === "published") return value;
  throw new CmsError(400, "bad_request", "Unknown media scope.");
}

export const onRequestGet = (context: PagesContext): Promise<Response> =>
  handleRequest(context.request, async () => {
    await requireIdentity(context);
    const slug = requireParam(context, "slug");
    const rawScope =
      new URL(context.request.url).searchParams.get("scope") ?? "draft";
    const scope = scopeValue(rawScope);
    const result = await articleService(context).listMedia(slug, scope);
    return jsonResponse({ ok: true, data: result });
  });

export const onRequestPost = (context: PagesContext): Promise<Response> =>
  handleRequest(context.request, async () => {
    const identity = await requireWriteAuth(context.request, context.env);
    enforceRateLimit(`${identity.email}:upload`, 20);
    const slug = requireParam(context, "slug");
    const form = await readFormData(
      context.request,
      MAX_MEDIA_BYTES + 1024 * 1024,
    );
    const file = form.get("file");
    if (!isUploadFile(file)) {
      throw new CmsError(
        400,
        "validation_failed",
        "Choose an image to upload.",
      );
    }
    if (file.size > MAX_MEDIA_BYTES) {
      throw new CmsError(
        413,
        "payload_too_large",
        "Images must be 8 MB or smaller.",
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_MEDIA_BYTES) {
      throw new CmsError(
        413,
        "payload_too_large",
        "Images must be 8 MB or smaller.",
      );
    }
    const scope = scopeValue(form.get("scope"));
    const alt = String(form.get("alt") ?? "");
    const captionValue = form.get("caption");
    const caption =
      typeof captionValue === "string" && captionValue.trim().length > 0
        ? captionValue
        : undefined;
    const replaceValue = form.get("replacePath");
    const replacePath =
      typeof replaceValue === "string" && replaceValue.length > 0
        ? replaceValue
        : undefined;
    const result = await articleService(context).uploadMedia({
      slug,
      scope,
      filename: file.name,
      bytes,
      alt,
      caption,
      replacePath,
      confirmReplace: form.get("confirmReplace") === "true",
    });
    if (result.commit && result.commit.changed.length > 0) {
      result.deployment = await deploymentStatusForCommit(
        context.env,
        result.commit.commitSha,
      );
    }
    return jsonResponse({ ok: true, data: result });
  });

interface DeleteMediaRequest {
  scope?: unknown;
  filename?: unknown;
  confirmFilename?: unknown;
}

export const onRequestDelete = (context: PagesContext): Promise<Response> =>
  handleRequest(context.request, async () => {
    const identity = await requireWriteAuth(context.request, context.env);
    enforceRateLimit(`${identity.email}:delete`, MAX_WRITES_PER_MINUTE);
    const slug = requireParam(context, "slug");
    const body = await readJson<DeleteMediaRequest>(context.request);
    if (typeof body.filename !== "string") {
      throw new CmsError(400, "validation_failed", "A filename is required.");
    }
    const scope = scopeValue(body.scope);
    const result = await articleService(context).deleteMedia(
      slug,
      scope,
      body.filename,
      typeof body.confirmFilename === "string" ? body.confirmFilename : "",
    );
    if (result.commit.changed.length > 0) {
      result.deployment = await deploymentStatusForCommit(
        context.env,
        result.commit.commitSha,
      );
    }
    return jsonResponse({ ok: true, data: result });
  });
