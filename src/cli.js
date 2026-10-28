#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { brandText } from "./brand.js";
import { loadProduct } from "./config.js";
import { createLogger } from "./log.js";
import { initCommand } from "./commands/init.js";
import { validateCommand } from "./commands/validate.js";
import { buildCommand } from "./commands/build.js";
import { devCommand } from "./commands/dev.js";
import { packCommand } from "./commands/pack.js";

const OPTIONS = {
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  config: { type: "string", short: "c" },
  out: { type: "string", short: "o" },
  force: { type: "boolean", short: "f" },
  port: { type: "string", short: "p" },
};

function helpText(product, stream = process.stdout) {
  return `${brandText(product.name, stream)} ${product.version} — ${product.tagline}

Usage: ${brandText(product.command, stream)} <command> [options]

Get started in minutes:

Commands:
  init          Create a new extension project to build on
  build         Get your extension ready to use (default)
  dev           Preview your extension as you make changes
  pack          Share your project's source as a zip
  validate      Check your extension for quick fixes
  help          Show this help

Options:
  -c, --config <file>      Path to your config file (default: ${product.defaults.configFilename})
  -o, --out <file>         Save to a specific location (build, dev, pack)
  -p, --port <number>      Choose a port for preview (default: ${product.defaults.devPort})
  -f, --force              Overwrite existing files (init only)
  -h, --help               Show this help
  -v, --version            See your version

Need help? We're here to make building easier.`;
}

async function main(args) {
  const product = loadProduct();
  const log = createLogger(product);
  const { values, positionals } = parseArgs({ args, options: OPTIONS, allowPositionals: true });

  if (values.version) {
    console.log(`${brandText(product.name)} ${product.version}`);
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
    case "pack":
      return packCommand(product, configPath, values.out ? resolve(values.out) : null, log) ? 0 : 1;
    default:
      log.error(
        `We don't recognize that command: "${command}". Try '${brandText(product.command, process.stderr)} help' to see what's available.`,
      );
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
    log.error(`We ran into a problem: ${err.message ?? String(err)}`);
    process.exitCode = 1;
  });
