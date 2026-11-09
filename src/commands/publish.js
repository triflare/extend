import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { apiRequest, extensionPath } from "../api.js";
import { compileExtension } from "../compile.js";
import { readCredentials } from "../credentials.js";
import { manifestFromProject } from "../manifest.js";
import { readProjectConfig } from "../project.js";
import { collectFiles, projectRoot, publishTargets, readPackSettings } from "../project-files.js";
import { remoteContext } from "../remote.js";
import { riskyPatternWarnings } from "../risky-patterns.js";
import { createTarGzip } from "../tar.js";
import { validateProject } from "../validate.js";

const RETRY_DELAY_MS = 1000;

function kib(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The registry runs `extend build` itself, so a local compile is only a fast
// fail: it catches a broken handler before the upload instead of after it.
async function checkLocally(product, configPath, log) {
  const result = await validateProject(configPath);
  if (result.warnings.length > 0) log.warn(result.warnings.join("\n"));
  if (!result.ok) {
    log.error(["We couldn't publish this project yet:", ...result.errors].join("\n"));
    return false;
  }
  let compiled;
  try {
    compiled = compileExtension(result.project, product);
  } catch (err) {
    log.error(`We couldn't finish building your extension: ${err.message}`);
    return false;
  }
  for (const warning of riskyPatternWarnings(compiled)) log.warn(warning);
  return true;
}

// The registry's build imports the entry point as an ES module, so the copy in
// the upload is marked accordingly. A project that declares CommonJS is refused
// rather than relabelled. The project's own package.json is never rewritten.
function archivedPackageJson(data, log) {
  let parsed;
  try {
    parsed = JSON.parse(data.toString("utf8"));
  } catch (err) {
    throw new Error(`Your package.json isn't valid JSON: ${err.message}`, { cause: err });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Your package.json must contain a JSON object.");
  }
  if (parsed.type === "commonjs") {
    throw new Error(
      'Your package.json marks this project as CommonJS, but the marketplace builds entry points as ES modules. Change "type" to "module" and use import/export, then publish again.',
    );
  }
  if (parsed.type !== "module") {
    log.warn(
      'The uploaded package.json gets "type": "module" added, which the registry needs to build it. Your file is unchanged.',
    );
    parsed.type = "module";
  }
  return Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`);
}

function archiveEntries(files, log) {
  const entries = [];
  let packageJson = null;
  for (const [name, file] of files) {
    const data = readFileSync(file.path);
    if (name === "package.json") {
      packageJson = { data, mtime: file.mtime };
      continue;
    }
    entries.push({ name, data, mtime: file.mtime });
  }
  const data = packageJson
    ? archivedPackageJson(packageJson.data, log)
    : Buffer.from('{\n  "type": "module"\n}\n');
  entries.push({ name: "package.json", data, mtime: packageJson?.mtime ?? new Date() });
  return entries.sort((left, right) => left.name.localeCompare(right.name));
}

// Only naming the account in a dry run, so an unreadable file or a sign-in for
// another registry just leaves the namespace off.
function storedNamespace(product) {
  try {
    return readCredentials(product)?.namespace ?? null;
  } catch {
    return null;
  }
}

function reportPublishError(log, err) {
  log.error(err.message);
  if (err.problem?.buildLog) {
    log.error(["The registry's build said:", err.problem.buildLog.trimEnd()].join("\n"));
  }
  if (err.status === 401) log.info("Run 'extend login' to sign in again.");
  if (err.status === 403 && /awaiting review/i.test(err.message)) {
    log.info("Only one version can wait for review at a time. Wait for a decision first.");
  }
  if (err.requestId) log.info(`Request id: ${err.requestId}`);
}

export async function publishCommand(product, configPath, values, log) {
  let config;
  let settings;
  try {
    config = readProjectConfig(configPath);
    settings = readPackSettings(config);
  } catch (err) {
    log.error(err.message);
    return false;
  }

  const { errors, manifest } = manifestFromProject(config);
  if (errors.length > 0) {
    log.error(["We can't publish this project yet. Here's what we noticed:", ...errors].join("\n"));
    return false;
  }

  let context = null;
  if (!values["dry-run"]) {
    try {
      context = await remoteContext(product, values);
    } catch (err) {
      log.error(err.message);
      return false;
    }
  }
  const { apiUrl, token, namespace } = context ?? {};

  if (!(await checkLocally(product, configPath, log))) return false;

  const root = projectRoot(configPath);
  const { files, errors: fileErrors } = collectFiles(
    root,
    publishTargets(config, settings, root, configPath),
  );
  if (fileErrors.length > 0) {
    log.error(
      ["We couldn't put your project together. Here's what we noticed:", ...fileErrors].join("\n"),
    );
    return false;
  }

  let tarball;
  try {
    tarball = createTarGzip(archiveEntries(files, log));
  } catch (err) {
    log.error(`We couldn't read your project files: ${err.message}`);
    return false;
  }

  const limit = product.marketplace?.maxSourceBytes ?? 1024 * 1024;
  if (tarball.length > limit) {
    log.error(
      `Your project is ${kib(tarball.length)} compressed, and the registry takes at most ${kib(limit)}. ${files.size} files went in; use "pack.include" to narrow what is carried.`,
    );
    return false;
  }

  if (values["dry-run"]) {
    const prefix = namespace ?? values.namespace ?? storedNamespace(product);
    log.success(
      `Ready to publish ${prefix ? `@${prefix}/` : ""}${manifest.id}@${manifest.version}: ${files.size} files, ${kib(tarball.length)}.`,
    );
    return true;
  }

  log.progress(`Uploading @${namespace}/${manifest.id}@${manifest.version}...`);
  const idempotencyKey = randomUUID();
  let response;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await apiRequest(apiUrl, `${extensionPath(namespace, manifest.id)}/versions`, {
        method: "POST",
        token,
        body: tarball,
        headers: {
          "content-type": "application/gzip",
          "idempotency-key": idempotencyKey,
        },
        timeoutMs: product.marketplace?.publishTimeoutMs ?? 120000,
      });
      break;
    } catch (err) {
      // A publish is the request most likely to time out after the registry has
      // already done the work, so a retry reuses the key and cannot publish
      // twice. Client errors are final.
      if (attempt === 0 && (err.status === 0 || err.status >= 500)) {
        log.warn("That upload didn't finish. Trying once more with the same idempotency key.");
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      reportPublishError(log, err);
      return false;
    }
  }

  const body =
    response.data && typeof response.data === "object" && !Array.isArray(response.data)
      ? response.data
      : null;
  const version = body?.version ?? manifest.version;
  const origin = new URL(apiUrl).origin;
  const location = response.headers.get("location");
  const url = location ? new URL(location, origin).toString() : null;
  if (body?.status === "pending") {
    log.success(
      `Uploaded @${namespace}/${manifest.id}@${version}. It's waiting for review${url ? `: ${url}` : "."}`,
    );
    log.raw("  An account's first publish is reviewed before it goes live.");
  } else if (body?.status === "published") {
    log.success(`Published @${namespace}/${manifest.id}@${version}.`);
    if (body.dist?.downloadUrl) log.raw(`  ${body.dist.downloadUrl}`);
    else if (url) log.raw(`  ${url}`);
  } else {
    log.success(`Uploaded @${namespace}/${manifest.id}@${version}.`);
    const options = ["namespace", "api", "config"]
      .filter((name) => values[name])
      .map((name) => `    --${name}: ${JSON.stringify(values[name])}`);
    if (options.length > 0) {
      log.raw(
        [
          "  The marketplace didn't say whether it's live yet. Run `extend versions` with these option values to check (shown as JSON strings; quote them for your shell):",
          ...options,
        ].join("\n"),
      );
    } else {
      log.raw(
        "  The marketplace didn't say whether it's live yet. Run `extend versions` to check.",
      );
    }
    if (values.token)
      log.raw("  Set TRIFLARE_TOKEN to the token you used with --token before running it.");
  }
  for (const warning of body?.warnings ?? []) {
    log.warn(`${warning.file}:${warning.line} — ${warning.message}`);
  }
  if (response.headers.get("idempotent-replayed")) {
    log.info("That upload replayed one that already finished, so nothing was published twice.");
  }
  return true;
}
