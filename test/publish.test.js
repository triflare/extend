import { test } from "node:test";
import assert from "node:assert/strict";
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
  assert.equal(
    guidance,
    [
      "  The marketplace didn't say whether it's live yet. Run `extend versions` with these option values to check (shown as JSON strings; quote them for your shell):",
      `    --namespace: ${JSON.stringify(values.namespace)}`,
      `    --api: ${JSON.stringify(values.api)}`,
      `    --config: ${JSON.stringify(config)}`,
    ].join("\n"),
  );
  assert.deepEqual(
    guidance
      .split("\n")
      .slice(1)
      .map((line) => JSON.parse(line.slice(line.indexOf(": ") + 2))),
    [values.namespace, values.api, config],
  );
  assert.match(messages.join("\n"), /Set TRIFLARE_TOKEN to the token you used with --token/);
  assert.ok(!messages.join("\n").includes(secret));
});

for (const values of [
  { namespace: "demo" },
  { api: "https://example.com/v1?value=$HOME&other=$(printf injected)" },
  {},
]) {
  test(`publish recovery with an environment token and options ${JSON.stringify(values)}`, async (t) => {
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
      return Response.json(options.method === "POST" ? {} : { namespace: "demo" });
    });

    assert.equal(await publishCommand(loadProduct(), config, values, log), true);
    const options = Object.entries(values).map(
      ([name, value]) => `    --${name}: ${JSON.stringify(value)}`,
    );
    const guidance = messages.find((message) => message.includes("The marketplace didn't say"));
    assert.equal(
      guidance,
      options.length > 0
        ? [
            "  The marketplace didn't say whether it's live yet. Run `extend versions` with these option values to check (shown as JSON strings; quote them for your shell):",
            ...options,
          ].join("\n")
        : "  The marketplace didn't say whether it's live yet. Run `extend versions` to check.",
    );
    assert.ok(!messages.join("\n").includes("TRIFLARE_TOKEN"));
  });
}
