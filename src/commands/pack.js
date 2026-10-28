import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { readProjectConfig } from "../project.js";
import { createZip } from "../zip.js";

const EXCLUDED_DIRECTORIES = new Set([".git", "node_modules"]);
const LOCKFILES = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
];

function display(path) {
  return relative(process.cwd(), path) || path;
}

function inside(root, path) {
  const rel = relative(root, path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

// The archive name comes from the project name so recipients see something
// recognizable instead of "extend.zip".
function archiveFilename(config) {
  const raw = config.name ?? config.extension?.id ?? "extension";
  const safe = String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  return `${safe || "extension"}.zip`;
}

function readPackSettings(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Your config file must contain a mapping");
  }
  const pack = config.pack ?? {};
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) {
    throw new Error('"pack" must be a mapping');
  }
  const include = pack.include ?? [];
  if (
    !Array.isArray(include) ||
    include.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    throw new Error('"pack.include" must be a list of file or directory paths');
  }
  if (
    pack.outputPath !== undefined &&
    (typeof pack.outputPath !== "string" || pack.outputPath.trim() === "")
  ) {
    throw new Error('"pack.outputPath" must be a path');
  }
  return { include, outputPath: pack.outputPath };
}

function packTargets(config, settings, root, configPath) {
  const targets = [{ path: resolve(configPath), required: true }];

  for (const path of ["src", "package.json", ...LOCKFILES]) {
    targets.push({ path: resolve(root, path), required: false });
  }

  if (typeof config.entryPoint === "string" && config.entryPoint) {
    targets.push({ path: resolve(root, config.entryPoint), required: true });
  }

  for (const include of settings.include) {
    targets.push({ path: resolve(root, include), required: true });
  }

  return targets;
}

function collectFiles(root, targets, archivePath) {
  const realRoot = realpathSync(root);
  const actualArchive = existsSync(archivePath) ? realpathSync(archivePath) : resolve(archivePath);
  const files = new Map();
  const errors = [];
  let visited = new Set();
  let outputCollision = false;

  const walk = (path, relPath) => {
    let stats;
    let actual;
    try {
      stats = lstatSync(path);
      actual = realpathSync(path);
    } catch (err) {
      errors.push(`We couldn't read ${display(path)}: ${err.message}`);
      return;
    }

    if (!inside(realRoot, actual)) {
      errors.push(`We can't pack ${display(path)} because it points outside ${display(root)}.`);
      return;
    }
    const destination = relative(realRoot, actual).split(sep);
    if (destination.some((part) => EXCLUDED_DIRECTORIES.has(part))) return;
    if (stats.isSymbolicLink()) {
      try {
        stats = statSync(actual);
      } catch (err) {
        errors.push(`We couldn't read ${display(path)}: ${err.message}`);
        return;
      }
    }

    if (stats.isDirectory()) {
      if (visited.has(actual)) return;
      visited.add(actual);
      let entries;
      try {
        entries = readdirSync(actual, { withFileTypes: true });
      } catch (err) {
        errors.push(`We couldn't read ${display(path)}: ${err.message}`);
        return;
      }
      for (const entry of entries) {
        if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
        const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
        walk(join(path, entry.name), childRel);
      }
      return;
    }

    if (!stats.isFile()) return;
    if (actual === actualArchive) {
      outputCollision = true;
      return;
    }
    const name = relPath.split(sep).join("/");
    if (!files.has(name)) files.set(name, { path: actual, mtime: stats.mtime });
  };

  for (const target of targets) {
    if (!inside(root, resolve(target.path))) {
      errors.push(`We can't pack ${display(target.path)} because it's outside ${display(root)}.`);
      continue;
    }
    // An explicit include can still name a directory the archive never carries.
    const relPath = relative(root, resolve(target.path));
    if (relPath.split(sep).some((part) => EXCLUDED_DIRECTORIES.has(part))) continue;
    if (!existsSync(target.path)) {
      if (target.required) errors.push(`We couldn't find ${display(target.path)}.`);
      continue;
    }
    // A path can be lexically inside the project while a parent directory is a
    // symlink out of it, so check where the target actually lives.
    let actualTarget;
    try {
      actualTarget = realpathSync(resolve(target.path));
    } catch (err) {
      errors.push(`We couldn't read ${display(target.path)}: ${err.message}`);
      continue;
    }
    if (!inside(realRoot, actualTarget)) {
      errors.push(
        `We can't pack ${display(target.path)} because it points outside ${display(root)}.`,
      );
      continue;
    }
    // Each target gets a fresh set so a directory an earlier symlink already
    // walked doesn't suppress a later target's own archive paths.
    visited = new Set();
    walk(target.path, relative(root, target.path).split(sep).join("/"));
  }

  return { files, errors, outputCollision };
}

export function packCommand(product, configPath, outOverride, overwrite, log) {
  const root = dirname(resolve(configPath));
  let config;
  let settings;
  try {
    config = readProjectConfig(configPath);
    settings = readPackSettings(config);
  } catch (err) {
    log.error(err.message);
    return false;
  }

  const output =
    outOverride ??
    resolve(
      root,
      settings.outputPath ??
        join(product.defaults?.outputDirectory ?? "dist", archiveFilename(config)),
    );
  const targets = packTargets(config, settings, root, configPath);

  log.progress(`Packing ${config.extension?.name ?? config.name ?? "your project"}...`);
  const { files, errors, outputCollision } = collectFiles(root, targets, output);
  if (errors.length > 0) {
    log.error(["We couldn't pack your project. Here's what we noticed:", ...errors].join("\n"));
    return false;
  }

  if (outputCollision) {
    log.error(
      `The output file ${display(output)} is one of the files being packed. Pick a different output path.`,
    );
    return false;
  }
  if (!overwrite && existsSync(output)) {
    log.error(`${display(output)} already exists. Run this again with --overwrite to replace it.`);
    return false;
  }

  let entries;
  try {
    entries = [...files.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, file]) => ({
        name,
        data: readFileSync(file.path),
        mtime: file.mtime,
      }));
  } catch (err) {
    log.error(`We couldn't read your project files: ${err.message}`);
    return false;
  }

  try {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, createZip(entries));
  } catch (err) {
    log.error(`We couldn't write your archive: ${err.message}`);
    return false;
  }

  log.success(`Done! Your project is ready to share at ${output}.`);
  return true;
}
