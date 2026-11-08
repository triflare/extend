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
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { whoamiCommand } from "./commands/whoami.js";
import { publishCommand } from "./commands/publish.js";
import { versionsCommand } from "./commands/versions.js";
import { unpublishCommand } from "./commands/unpublish.js";
import { tokenCommand } from "./commands/token.js";

const OPTIONS = {
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  config: { type: "string", short: "c" },
  out: { type: "string", short: "o" },
  force: { type: "boolean", short: "f" },
  overwrite: { type: "boolean" },
  port: { type: "string", short: "p" },
  api: { type: "string" },
  token: { type: "string" },
  namespace: { type: "string" },
  "dry-run": { type: "boolean" },
  status: { type: "string" },
  scopes: { type: "string" },
  expires: { type: "string" },
  name: { type: "string" },
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

Marketplace:
  login         Sign in by approving a code in your browser
  logout        Sign out on this machine
  whoami        See which account you're signed in as
  publish       Upload your extension for review and release
  versions      List the versions that are published
  unpublish     Hide a published version from listings
  token create  Make a token for publishing from CI

Options:
  -c, --config <file>      Path to your config file (default: ${product.defaults.configFilename})
  -o, --out <file>         Save to a specific location (build, dev, pack)
  -p, --port <number>      Choose a port for preview (default: ${product.defaults.devPort})
  -f, --force              Overwrite existing files (init only)
  --overwrite              Replace an existing archive (pack)
  --api <url>              Marketplace API to talk to
  --token <secret>         Use a token instead of the saved sign-in
  --namespace <name>       Act as an organization you own
  --dry-run                Check everything and upload nothing (publish)
  --status <state>         Show versions in one state (versions)
  --scopes <list>          Scopes for the new token, such as publish,yank (token)
  --expires <days>         Days until the new token expires (token)
  --name <name>            Label for the new token (token)
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
      return packCommand(
        product,
        configPath,
        values.out ? resolve(values.out) : null,
        values.overwrite,
        log,
      )
        ? 0
        : 1;
    case "login":
      return (await loginCommand(product, values, log)) ? 0 : 1;
    case "logout":
      return (await logoutCommand(product, values, log)) ? 0 : 1;
    case "whoami":
      return (await whoamiCommand(product, values, log)) ? 0 : 1;
    case "publish":
      return (await publishCommand(product, configPath, values, log)) ? 0 : 1;
    case "versions":
      return (await versionsCommand(product, configPath, values, log)) ? 0 : 1;
    case "unpublish":
      return (await unpublishCommand(product, configPath, positionals[1], values, log)) ? 0 : 1;
    case "token":
      return (await tokenCommand(product, positionals[1], values, log)) ? 0 : 1;
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
