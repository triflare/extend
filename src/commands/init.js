import { existsSync, lstatSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

function templateYml(fallbackColor) {
  return `name: "my-extension"
version: "0.1.0"
description: ""
author: ""
license: "MIT"

entryPoint: "src/index.js"
outputPath: "dist/extension.js"

extension:
  id: "myextension"
  name: "My Extension"
  className: "MyExtension"
  color1: "${fallbackColor}"
  color2: "${fallbackColor}"
  color3: "${fallbackColor}"

blocks:
  - opcode: hello
    blockType: reporter
    text: "say hello"
`;
}

function templateIndex() {
  return `import { hello } from "./blocks/hello.js";

export const blocks = {
  hello,
};

export function setup() {
  console.log("[my-extension] loaded");
}
`;
}

function templateHello() {
  return `export function hello(args, util) {
  return "Hello TurboWarp!";
}
`;
}

function files(product) {
  return {
    [product.defaults.configFilename]: () =>
      templateYml(product.defaults.fallbackColor ?? "#0070F3"),
    "src/index.js": () => templateIndex(),
    "src/blocks/hello.js": () => templateHello(),
  };
}

function parentDirs(dir, rel) {
  const out = [];
  let parent = dirname(join(dir, rel));
  while (parent !== dir) {
    out.push(parent);
    parent = dirname(parent);
  }
  return out;
}

function isSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

export function initCommand(product, target, force, log) {
  const dir = resolve(target ?? ".");
  const templates = files(product);
  let existing = dir;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  if (!statSync(existing).isDirectory()) {
    log.error(
      `We can't set up your project in ${relative(process.cwd(), existing)} because it's not a directory.`,
    );
    return false;
  }
  const conflicts = [];
  for (const rel of Object.keys(templates)) {
    if (existsSync(join(dir, rel)) && !force) conflicts.push(rel);
  }
  const blockedParents = new Set();
  for (const rel of Object.keys(templates)) {
    for (const parent of parentDirs(dir, rel)) {
      if (existsSync(parent) && !statSync(parent).isDirectory()) blockedParents.add(parent);
    }
  }
  if (conflicts.length > 0 || blockedParents.size > 0) {
    for (const rel of conflicts)
      log.error(`We found an existing file at ${relative(process.cwd(), resolve(dir, rel))}.`);
    for (const parent of blockedParents)
      log.error(`We can't use ${relative(process.cwd(), parent)} because it's not a directory.`);
    if (conflicts.length > 0)
      log.info(`If you'd like to replace them, run this again with --force.`);
    return false;
  }
  const root = resolve(dir);
  if (isSymlink(root)) {
    log.error(`We couldn't use ${relative(process.cwd(), root)} because it's a symbolic link.`);
    return false;
  }
  for (const rel of Object.keys(templates)) {
    const output = resolve(root, rel);
    const relToRoot = relative(root, output);
    if (relToRoot !== "" && (relToRoot === ".." || relToRoot.startsWith(`..${sep}`))) {
      log.error(
        `We can't save ${relative(process.cwd(), output)} because it's outside ${relative(process.cwd(), root)}.`,
      );
      return false;
    }
    let component = root;
    for (const part of relToRoot.split(sep)) {
      if (part === "") continue;
      component = join(component, part);
      if (isSymlink(component)) {
        log.error(
          `We couldn't use ${relative(process.cwd(), component)} because it's a symbolic link.`,
        );
        return false;
      }
    }
  }
  mkdirSync(dir, { recursive: true });
  for (const [rel, render] of Object.entries(templates)) {
    const output = resolve(root, rel);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, render(product), "utf8");
    log.bullet(relative(process.cwd(), output));
  }
  log.success(`All set! Your new project is ready in ${dir}.`);
  return true;
}
