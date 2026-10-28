import { dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { compileExtension } from "../compile.js";
import { riskyPatternWarnings } from "../risky-patterns.js";
import { validateProject } from "../validate.js";
import { resolveOutputPath } from "../project.js";

// The build without the narration, so the dev server can run the first one in
// this process and skip a second cold Node start before it can serve anything.
export async function buildProduct(product, configPath, outOverride, onValidated) {
  const result = await validateProject(configPath);
  if (!result.ok) return { ok: false, errors: result.errors, warnings: [], project: null };

  const { config, root, module: mod } = result.project;
  onValidated?.(config);
  const output = resolveOutputPath(product, config, root, outOverride);
  const compiled = compileExtension({ config, root, module: mod }, product);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, compiled, "utf8");
  return {
    ok: true,
    errors: [],
    warnings: [...result.warnings, ...riskyPatternWarnings(compiled)],
    output,
    config,
  };
}

export async function buildCommand(product, configPath, outOverride, log) {
  const result = await buildProduct(product, configPath, outOverride, (config) =>
    log.progress(`Getting ${config.extension?.name ?? config.name ?? "your extension"} ready...`),
  );
  if (!result.ok) {
    log.error(
      ["We found a few things to fix. Here's what we noticed:", ...result.errors].join("\n"),
    );
    return false;
  }
  if (result.warnings.length > 0) log.warn(result.warnings.join("\n"));

  log.success(`Done! Your extension is ready at ${result.output}.`);
  return true;
}
