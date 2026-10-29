import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEV_VARS = join(ROOT, ".dev.vars");
const GITHUB_VARIABLES = [
  "GITHUB_APP_ID",
  "GITHUB_APP_INSTALLATION_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_OWNER",
  "GITHUB_REPO",
  "GITHUB_BRANCH",
];

export function parseEnvFile(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[name] = value;
  }
  return env;
}

export function checkLocalConfig(env) {
  const errors = [];
  const warnings = [];

  if (env.CMS_ENVIRONMENT !== "local") {
    errors.push("CMS_ENVIRONMENT must be local.");
  }
  if (env.CMS_DEV_BYPASS !== "true") {
    errors.push("CMS_DEV_BYPASS must be true.");
  }
  if (!(env.CMS_DEV_EMAIL ?? "").trim()) {
    errors.push("CMS_DEV_EMAIL must be set.");
  }
  if (!(env.CMS_ALLOWED_EMAILS ?? "").trim()) {
    errors.push("CMS_ALLOWED_EMAILS must be set.");
  }
  if ((env.CMS_CSRF_SECRET ?? "").length < 32) {
    errors.push("CMS_CSRF_SECRET must contain at least 32 characters.");
  }

  const missingGithub = GITHUB_VARIABLES.filter(
    (name) => !(env[name] ?? "").trim(),
  );
  if (missingGithub.length > 0) {
    warnings.push(
      `Article loading and saving still need: ${missingGithub.join(", ")}.`,
    );
  }

  return { errors, warnings };
}

function main() {
  if (!existsSync(DEV_VARS)) {
    console.error(
      "Missing .dev.vars. Copy .dev.vars.example to .dev.vars and set local values.",
    );
    process.exitCode = 1;
    return;
  }

  const env = parseEnvFile(readFileSync(DEV_VARS, "utf8"));
  const { errors, warnings } = checkLocalConfig(env);

  if (warnings.length > 0) {
    for (const warning of warnings) console.warn(`Warning: ${warning}`);
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(`Error: ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("Local CMS configuration is ready.");
  console.log("Start the desk with: npm run dev:cms");
  console.log("Open: http://localhost:8788/r1phun73r/");
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) main();
