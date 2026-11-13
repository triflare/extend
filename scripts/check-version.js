#!/usr/bin/env node
/**
 * Fail a release when a version file disagrees with the version
 * semantic-release computed.
 *
 * `scripts/set-version.js` rewrites every place Extend publishes a version.
 * This runs immediately after it and asserts the rewrite actually landed, so a
 * missing file or partial write fails the release before npm sees it.
 * semantic-release derives its tag from the same value, so a passing check
 * means the tag, the package, and `extend --version` agree.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadProduct } from "../src/config.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const requested = process.argv[2];
if (!requested) {
  process.stderr.write("[extend] usage: node scripts/check-version.js <version>\n");
  process.exit(1);
}

// Accept the release tag (`v1.2.3`) or the bare version semantic-release
// exposes as `nextRelease.version`.
const version = requested.replace(/^v/, "");

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
}

const failures = [];

function expect(label, actual) {
  if (actual !== version)
    failures.push(`${label}: expected ${version}, found ${actual ?? "(none)"}`);
}

expect("product.yml", loadProduct().version);
expect("package.json", readJson("package.json").version);

const lock = readJson("package-lock.json");
expect("package-lock.json", lock.version);
expect('package-lock.json packages[""]', lock.packages?.[""]?.version);

if (failures.length > 0) {
  process.stderr.write(`[extend] version check failed for ${version}:\n`);
  for (const failure of failures) process.stderr.write(`  - ${failure}\n`);
  process.exit(1);
}

process.stdout.write(`[extend] ${version} matches product.yml and package manifests\n`);
