import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const EXCLUDED_DIRECTORIES = new Set([".git", "node_modules"]);
const LOCKFILES = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
];

export function display(path) {
  return relative(process.cwd(), path) || path;
}

export function inside(root, path) {
  const rel = relative(root, path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

export function readPackSettings(config) {
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

export function packTargets(config, settings, root, configPath) {
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

// A publish carries what the registry compiles: the manifest, the sources, and
// a package.json. Lockfiles are left out because the build installs nothing.
export function publishTargets(config, settings, root, configPath) {
  const targets = [{ path: resolve(configPath), required: true }];

  for (const path of ["src", "package.json"]) {
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

export function collectFiles(root, targets, archivePath = null) {
  const realRoot = realpathSync(root);
  const archiveStats = archivePath && existsSync(archivePath) ? statSync(archivePath) : null;
  const actualArchive = archiveStats ? realpathSync(archivePath) : archivePath;
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
    if (
      actual === actualArchive ||
      (archiveStats && stats.dev === archiveStats.dev && stats.ino === archiveStats.ino)
    ) {
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

export function projectRoot(configPath) {
  return dirname(resolve(configPath));
}
