import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// One file for one registry. A second login replaces it rather than growing a
// map, since nothing a developer does needs two registries at once.
export function credentialsPath(product) {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, product.marketplace?.configDirectory ?? "triflare", "credentials.json");
}

export function readCredentials(product) {
  const path = credentialsPath(product);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new Error(`We couldn't read your saved sign-in at ${path}: ${err.message}`, {
      cause: err,
    });
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Your saved sign-in at ${path} isn't valid JSON: ${err.message}`, {
      cause: err,
    });
  }
}

export function writeCredentials(product, credentials) {
  const path = credentialsPath(product);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  // An existing file keeps its mode through writeFileSync, so the permission is
  // set again rather than trusted.
  chmodSync(path, 0o600);
  return path;
}

export function clearCredentials(product) {
  rmSync(credentialsPath(product), { force: true });
}
