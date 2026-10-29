import assert from "node:assert/strict";
import { test } from "node:test";

import { checkLocalConfig, parseEnvFile } from "../scripts/cms-doctor.mjs";

const LOCAL_ENV = {
  CMS_ENVIRONMENT: "local",
  CMS_DEV_BYPASS: "true",
  CMS_DEV_EMAIL: "dev@localhost",
  CMS_ALLOWED_EMAILS: "dev@localhost",
  CMS_CSRF_SECRET: "local-test-only-secret-with-at-least-32-characters",
  GITHUB_APP_ID: "1",
  GITHUB_APP_INSTALLATION_ID: "2",
  GITHUB_APP_PRIVATE_KEY: "test-only-private-key",
  GITHUB_OWNER: "owner",
  GITHUB_REPO: "repo",
  GITHUB_BRANCH: "main",
};

test(".dev.vars parsing ignores comments and handles quoted values", () => {
  const env = parseEnvFile(`
# comment
CMS_ENVIRONMENT=local
CMS_DEV_BYPASS="true"
CMS_DEV_EMAIL='dev@localhost'
MALFORMED
`);

  assert.deepEqual(env, {
    CMS_ENVIRONMENT: "local",
    CMS_DEV_BYPASS: "true",
    CMS_DEV_EMAIL: "dev@localhost",
  });
});

test("local CMS config requires the bypass and CSRF secret, but not GitHub", () => {
  assert.deepEqual(checkLocalConfig(LOCAL_ENV), { errors: [], warnings: [] });

  const missing = checkLocalConfig({});
  assert.ok(missing.errors.some((error) => error.includes("CMS_ENVIRONMENT")));
  assert.ok(missing.errors.some((error) => error.includes("CMS_DEV_BYPASS")));
  assert.ok(missing.errors.some((error) => error.includes("CMS_CSRF_SECRET")));
  assert.ok(
    missing.warnings.some((warning) => warning.includes("GITHUB_APP_ID")),
  );
});

test("local CMS config rejects production mode and short CSRF secrets", () => {
  const result = checkLocalConfig({
    ...LOCAL_ENV,
    CMS_ENVIRONMENT: "production",
    CMS_CSRF_SECRET: "too-short",
  });

  assert.ok(result.errors.some((error) => error.includes("CMS_ENVIRONMENT")));
  assert.ok(result.errors.some((error) => error.includes("CMS_CSRF_SECRET")));
});
