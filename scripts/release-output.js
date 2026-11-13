#!/usr/bin/env node
/**
 * Expose the release semantic-release just published to the workflow.
 *
 * `@semantic-release/exec` runs this after a successful release. The values are
 * appended to `$GITHUB_OUTPUT` so later jobs can depend on the version and
 * channel instead of re-deriving them.
 */
import fs from "node:fs";
import process from "node:process";

const [version, channel] = process.argv.slice(2);
if (!version) {
  process.stderr.write("[extend] usage: node scripts/release-output.js <version> [channel]\n");
  process.exit(1);
}

const output = process.env.GITHUB_OUTPUT;
if (!output) {
  process.stderr.write("[extend] GITHUB_OUTPUT is not set; skipping output\n");
  process.exit(0);
}

fs.appendFileSync(
  output,
  ["released=true", `version=${version}`, `channel=${channel ?? ""}`].join("\n") + "\n",
);
