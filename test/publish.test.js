import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { publishCommand } from "../src/commands/publish.js";
import { loadProduct } from "../src/config.js";

test("publish recovery retains options and explains how to reuse a flag token", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "extend-publish-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const project = join(dir, "project's $HOME $(printf injected)");
  cpSync(fileURLToPath(new URL("../test-fixtures/basic", import.meta.url)), project, {
    recursive: true,
  });
  const config = join(project, "extend.yml");
  const secret = "test-token-should-not-appear";
  const values = { token: secret, namespace: "demo", api: "https://example.com/v1", config };
  const messages = [];
  const log = Object.fromEntries(
    ["error", "warn", "info", "progress", "success", "raw"].map((level) => [
      level,
      (message) => messages.push(message),
    ]),
  );
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options.headers.authorization, `Bearer ${secret}`);
    return Response.json({});
  });

  assert.equal(await publishCommand(loadProduct(), config, values, log), true);
  const guidance = messages.find((message) => message.includes("The marketplace didn't say"));
  assert.ok(guidance);
  const command = guidance.slice(
    guidance.indexOf("Run `") + 5,
    guidance.lastIndexOf("` to check."),
  );
  const parsed = spawnSync("sh", ["-c", `set -- ${command}; printf '%s\\0' "$@"`], {
    encoding: "utf8",
  });
  assert.equal(parsed.status, 0, parsed.stderr);
  assert.deepEqual(parsed.stdout.split("\0").slice(0, -1), [
    "extend",
    "versions",
    "--namespace",
    "demo",
    "--api",
    values.api,
    "--config",
    config,
  ]);
  assert.match(messages.join("\n"), /Set TRIFLARE_TOKEN to the token you used with --token/);
  assert.ok(!messages.join("\n").includes(secret));
});

test("publish recovery keeps the existing guidance for an environment token", async (t) => {
  const previousToken = process.env.TRIFLARE_TOKEN;
  process.env.TRIFLARE_TOKEN = "environment-token";
  t.after(() => {
    if (previousToken === undefined) delete process.env.TRIFLARE_TOKEN;
    else process.env.TRIFLARE_TOKEN = previousToken;
  });
  const config = fileURLToPath(new URL("../test-fixtures/basic/extend.yml", import.meta.url));
  const messages = [];
  const log = Object.fromEntries(
    ["error", "warn", "info", "progress", "success", "raw"].map((level) => [
      level,
      (message) => messages.push(message),
    ]),
  );
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options.headers.authorization, "Bearer environment-token");
    return Response.json({});
  });

  assert.equal(await publishCommand(loadProduct(), config, { namespace: "demo" }, log), true);
  assert.ok(
    messages.includes(
      "  The marketplace didn't say whether it's live yet. Run `extend versions --namespace demo` to check.",
    ),
  );
  assert.ok(!messages.join("\n").includes("TRIFLARE_TOKEN"));
});
