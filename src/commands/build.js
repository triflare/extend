import { dirname, resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { compileExtension } from "../compile.js";
import { riskyPatternWarnings } from "../risky-patterns.js";
import { validateProject } from "../validate.js";
import { readProjectConfig, resolveOutputPath } from "../project.js";
import { readBuildHooks, runBuildHook } from "../build-hooks.js";

// The build without the narration, so the dev server can run the first one in
// this process and skip a second cold Node start before it can serve anything.
export async function buildProduct(product, configPath, outOverride, { onStart, onHook } = {}) {
  const root = dirname(resolve(configPath));
  let config;
  let hooks;
  try {
    config = readProjectConfig(configPath);
    hooks = readBuildHooks(config);
  } catch (err) {
    return { ok: false, errors: [err.message], warnings: [], project: null };
  }

  onStart?.(config);

  // A before hook runs ahead of validation so it can generate the files the
  // entry point imports.
  for (const command of hooks.before) {
    onHook?.("before", command);
    const failure = await runBuildHook("before", command, { root });
    if (failure) return { ok: false, errors: [failure], warnings: [], project: null };
  }

  const result = await validateProject(configPath);
  if (!result.ok) return { ok: false, errors: result.errors, warnings: [], project: null };

  const { config: checked, root: projectRoot, module: mod } = result.project;
  const output = resolveOutputPath(product, checked, projectRoot, outOverride);
  const compiled = compileExtension({ config: checked, root: projectRoot, module: mod }, product);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, compiled, "utf8");

  for (const command of hooks.after) {
    onHook?.("after", command);
    const failure = await runBuildHook("after", command, { root: projectRoot, output });
    if (failure) return { ok: false, errors: [failure], warnings: [], project: result.project };
  }

  // An after hook can rewrite or delete the file, so what ships is what is on
  // disk now, and the warnings describe that version rather than the one the
  // compiler produced.
  let source;
  try {
    source = readFileSync(output, "utf8");
  } catch (err) {
    return {
      ok: false,
      errors: [`We couldn't read ${output} after the build hooks ran: ${err.message}`],
      warnings: [],
      project: result.project,
    };
  }

  return {
    ok: true,
    errors: [],
    warnings: [...result.warnings, ...riskyPatternWarnings(source)],
    output,
    config: checked,
  };
}

export async function buildCommand(product, configPath, outOverride, log) {
  const result = await buildProduct(product, configPath, outOverride, {
    onStart: (config) =>
      log.progress(`Getting ${config.extension?.name ?? config.name ?? "your extension"} ready...`),
    onHook: (phase, command) => log.progress(`Running the ${phase} build hook: ${command}`),
  });
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
