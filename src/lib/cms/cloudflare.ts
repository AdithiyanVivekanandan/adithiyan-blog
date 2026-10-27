import type { DeploymentStatus } from "./types.ts";

interface PagesDeployment {
  id?: string;
  url?: string;
  created_on?: string;
  latest_stage?: {
    name?: string;
    status?: string;
  };
  deployment_trigger?: {
    metadata?: {
      commit_hash?: string;
    };
  };
}

function configured(env: { [key: string]: string | undefined }): {
  token: string;
  accountId: string;
  project: string;
} | null {
  const token = env.CLOUDFLARE_API_TOKEN?.trim();
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const project = env.CLOUDFLARE_PAGES_PROJECT?.trim();
  if (!token || !accountId || !project) return null;
  return { token, accountId, project };
}

function mapStatus(status: string | undefined): string {
  switch (status) {
    case "success":
      return "success";
    case "failure":
      return "failure";
    case "canceled":
      return "canceled";
    case "active":
    case "building":
      return "building";
    case "queued":
      return "queued";
    case "skipped":
      return "skipped";
    default:
      return "unknown";
  }
}

export async function deploymentStatusForCommit(
  env: { [key: string]: string | undefined },
  commitSha: string,
): Promise<DeploymentStatus | null> {
  const config = configured(env);
  if (!config) return null;
  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/pages/projects/${encodeURIComponent(config.project)}/deployments?per_page=25`,
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/json",
        },
      },
    );
  } catch {
    return {
      state: "unknown",
      commitSha,
      detail:
        "The commit is saved, but the Cloudflare Pages deployment status could not be checked.",
    };
  }
  if (!response.ok) {
    return {
      state: "unknown",
      commitSha,
      detail:
        "The commit is saved, but the Cloudflare Pages deployment status could not be checked.",
    };
  }
  let payload: { result?: PagesDeployment[] };
  try {
    payload = (await response.json()) as { result?: PagesDeployment[] };
  } catch {
    return {
      state: "unknown",
      commitSha,
      detail: "Cloudflare returned an unreadable deployment response.",
    };
  }
  const deployments = Array.isArray(payload.result) ? payload.result : [];
  const deployment = deployments.find(
    (item) => item.deployment_trigger?.metadata?.commit_hash === commitSha,
  );
  if (!deployment) {
    return {
      state: "pending",
      commitSha,
      detail:
        "No Cloudflare Pages deployment is visible for this commit yet. Refresh in a moment.",
    };
  }
  return {
    state: mapStatus(deployment.latest_stage?.status),
    commitSha,
    ...(deployment.url ? { url: deployment.url } : {}),
    ...(deployment.created_on ? { updatedAt: deployment.created_on } : {}),
    ...(deployment.latest_stage?.name
      ? { detail: `Stage: ${deployment.latest_stage.name}` }
      : {}),
  };
}

export function deploymentConfigured(env: {
  [key: string]: string | undefined;
}): boolean {
  return configured(env) !== null;
}
