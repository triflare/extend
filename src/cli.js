#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { loadProduct } from "./config.js";
import { createLogger } from "./log.js";
import { initCommand } from "./commands/init.js";
import { validateCommand } from "./commands/validate.js";
import { buildCommand } from "./commands/build.js";
import { devCommand } from "./commands/dev.js";

const OPTIONS = {
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  config: { type: "string", short: "c" },
  out: { type: "string", short: "o" },
  force: { type: "boolean", short: "f" },
  port: { type: "string", short: "p" },
};

function helpText(product) {
  return `${product.name} ${product.version} — ${product.tagline}

Usage: ${product.command} <command> [options]

Commands:
  build         Validate and compile the extension (default)
  dev           Rebuild on change and serve the extension at http://localhost:${product.defaults.devPort}
  validate      Check blocks against the entryPoint handlers
  init          Scaffold a new project in a directory
  help          Show this help

Options:
  -c, --config <file>      Path to ${product.defaults.configFilename} (default: ${product.defaults.configFilename})
  -o, --out <file>         Override the output path (build, dev)
  -p, --port <number>      Port for the dev server (default: ${product.defaults.devPort})
  -f, --force              Overwrite existing files (init only)
  -h, --help               Show this help
  -v, --version            Print the version`;
}

async function main(args) {
  const product = loadProduct();
  const log = createLogger(product);
  const { values, positionals } = parseArgs({ args, options: OPTIONS, allowPositionals: true });

  if (values.version) {
    console.log(`${product.name} ${product.version}`);
    return 0;
  }
  if (values.help) {
    console.log(helpText(product));
    return 0;
  }

  const command = positionals[0] ?? "build";
  const configPath = resolve(values.config ?? product.defaults.configFilename);
  switch (command) {
    case "help":
      console.log(helpText(product));
      return 0;
    case "init":
      return initCommand(product, positionals[1], values.force, log) ? 0 : 1;
    case "validate":
      return (await validateCommand(product, configPath, log)) ? 0 : 1;
    case "build":
      return (await buildCommand(product, configPath, values.out ? resolve(values.out) : null, log))
        ? 0
        : 1;
    case "dev":
      return (await devCommand(product, configPath, values, log)) ? 0 : 1;
    default:
      log.error(`Unknown command "${command}"`);
      console.log(helpText(product));
      return 1;
  }
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    const log = createLogger(loadProduct());
    log.error(err.message ?? String(err));
    process.exitCode = 1;
  });
