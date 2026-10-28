import { compileExtension } from "../compile.js";
import { riskyPatternWarnings } from "../risky-patterns.js";
import { validateProject } from "../validate.js";

export async function validateCommand(product, configPath, log) {
  const result = await validateProject(configPath);
  if (result.warnings.length > 0) log.warn(result.warnings.join("\n"));
  if (!result.ok) {
    log.error(
      ["We found a few things to fix. Here's what we noticed:", ...result.errors].join("\n"),
    );
    return false;
  }
  const { config, root, module: mod } = result.project;
  let compiled;
  try {
    compiled = compileExtension({ config, root, module: mod }, product);
  } catch (err) {
    log.error(`We couldn't finish checking your extension: ${err.message}`);
    return false;
  }
  const risky = riskyPatternWarnings(compiled);
  if (risky.length > 0) log.warn(risky.join("\n"));
  const count = config.blocks.length;
  log.success(`${count} block${count === 1 ? "" : "s"} validated — everything looks good!`);
  return true;
}
