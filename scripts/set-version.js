#!/usr/bin/env node
/**
 * Write the version semantic-release computed into every place Triflare Extend
 * publishes it.
 *
 * The CLI reports `product.yml`'s version at runtime, so updating `package.json`
 * alone is not enough. `@semantic-release/npm` owns `package.json`; this script
 * owns the rest so a single release commit keeps them in step.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const version = process.argv[2];
if (!version) {
  process.stderr.write("[extend] usage: node scripts/set-version.js <version>\n");
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Update a `package.json` and the two version fields of its lockfile. */
function setPackageVersion(manifest, lockfile) {
  const pkg = readJson(manifest);
  pkg.version = version;
  writeJson(manifest, pkg);

  const lock = readJson(lockfile);
  lock.version = version;
  if (lock.packages?.[""]) lock.packages[""].version = version;
  writeJson(lockfile, lock);
}

/**
 * Replace the `version:` line in product.yml. A YAML round-trip would drop the
 * file's comments, so the line is rewritten in place.
 */
function setProductVersion() {
  const file = path.join(ROOT, "product.yml");
  const source = fs.readFileSync(file, "utf8");
  const next = source.replace(
    /^(version:\s*).*$/m,
    (_match, prefix) => `${prefix}${JSON.stringify(version)}`,
  );
  if (next === source) throw new Error("product.yml has no version: line to update");
  fs.writeFileSync(file, next);
}

setPackageVersion(path.join(ROOT, "package.json"), path.join(ROOT, "package-lock.json"));
setProductVersion();
