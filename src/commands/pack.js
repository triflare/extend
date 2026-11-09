import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { readProjectConfig } from "../project.js";
import { collectFiles, display, packTargets, readPackSettings } from "../project-files.js";
import { createZip } from "../zip.js";

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
