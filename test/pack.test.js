import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));

function runCli(args, cwd) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
}

function tmpProject() {
  const dir = mkdtempSync(join(tmpdir(), "extend-pack-"));
  const init = runCli(["init"], dir);
  assert.equal(init.status, 0, init.stderr);
  return dir;
}

function clean(...dirs) {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
}

function addPackConfig(dir, yaml) {
  const path = join(dir, "extend.yml");
  writeFileSync(path, `${readFileSync(path, "utf8")}\n${yaml}\n`);
}

// The archive reader only needs the central directory and the deflated bodies.
function readZip(path) {
  const buffer = readFileSync(path);
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.notEqual(end, -1, "the file should end with a central directory record");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const body = buffer.subarray(start, start + compressedSize);
    entries.set(name, method === 0 ? body : inflateRawSync(body));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function names(entries) {
  return [...entries.keys()].sort();
}

test("pack archives the config and src by default", () => {
  const dir = tmpProject();
  try {
    const result = runCli(["pack"], dir);
    assert.equal(result.status, 0, result.stderr);
    const output = join(dir, "dist", "my-extension.zip");
    assert.ok(existsSync(output));
    const entries = readZip(output);
    assert.deepEqual(names(entries), ["extend.yml", "src/blocks/hello.js", "src/index.js"]);
    assert.match(entries.get("src/index.js").toString(), /export const blocks/);
    assert.match(entries.get("extend.yml").toString(), /entryPoint: "src\/index.js"/);
  } finally {
    clean(dir);
  }
});

test("pack includes configured paths, package.json, and lockfiles", () => {
  const dir = tmpProject();
  try {
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "assets", "icon.txt"), "icon");
    writeFileSync(join(dir, "README.md"), "# Notes");
    writeFileSync(join(dir, "package.json"), '{"type":"module"}');
    writeFileSync(join(dir, "package-lock.json"), "{}");
    writeFileSync(join(dir, "yarn.lock"), "# yarn");
    addPackConfig(dir, "pack:\n  include:\n    - assets\n    - README.md");
    const output = join(dir, "share.zip");
    const result = runCli(["pack", "-o", output], dir);
    assert.equal(result.status, 0, result.stderr);
    const entries = readZip(output);
    assert.deepEqual(names(entries), [
      "README.md",
      "assets/icon.txt",
      "extend.yml",
      "package-lock.json",
      "package.json",
      "src/blocks/hello.js",
      "src/index.js",
      "yarn.lock",
    ]);
    assert.equal(entries.get("README.md").toString(), "# Notes");
    assert.equal(entries.get("assets/icon.txt").toString(), "icon");
  } finally {
    clean(dir);
  }
});

test("pack skips .git, node_modules, and the archive itself", () => {
  const dir = tmpProject();
  try {
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "config"), "secret");
    mkdirSync(join(dir, "node_modules", "dep"), { recursive: true });
    writeFileSync(join(dir, "node_modules", "dep", "index.js"), "module.exports = 1;");
    addPackConfig(dir, 'pack:\n  include:\n    - "."\n    - node_modules\n    - .git/config');
    const output = join(dir, "dist", "my-extension.zip");
    assert.equal(runCli(["pack"], dir).status, 0);
    const first = readZip(output);
    assert.ok(first.has("src/index.js"));
    assert.ok(!first.has(".git/config"));
    assert.ok(!first.has("node_modules/dep/index.js"));
    assert.ok(!first.has("dist/my-extension.zip"));

    // The second run sees the archive from the first and must still leave it out.
    assert.equal(runCli(["pack"], dir).status, 0);
    const second = readZip(output);
    assert.ok(!second.has("dist/my-extension.zip"));
  } finally {
    clean(dir);
  }
});

test("pack rejects an included path outside the project", () => {
  const container = mkdtempSync(join(tmpdir(), "extend-pack-"));
  const dir = join(container, "project");
  try {
    mkdirSync(dir);
    assert.equal(runCli(["init"], dir).status, 0);
    writeFileSync(join(container, "outside.txt"), "outside");
    addPackConfig(dir, "pack:\n  include:\n    - ../outside.txt");
    const result = runCli(["pack"], dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /outside/);
    assert.ok(!existsSync(join(dir, "dist", "my-extension.zip")));
  } finally {
    clean(container);
  }
});

test("pack rejects a symlink that points outside the project", (t) => {
  const container = mkdtempSync(join(tmpdir(), "extend-pack-"));
  const dir = join(container, "project");
  try {
    mkdirSync(dir);
    assert.equal(runCli(["init"], dir).status, 0);
    writeFileSync(join(container, "secret.js"), "export const secret = true;");
    try {
      symlinkSync(join(container, "secret.js"), join(dir, "src", "linked.js"));
    } catch (err) {
      t.skip(`symlinks are unavailable: ${err.message}`);
      return;
    }
    const result = runCli(["pack"], dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /points outside/);
    assert.ok(!existsSync(join(dir, "dist", "my-extension.zip")));
  } finally {
    clean(container);
  }
});

test("pack rejects an include reached through a directory symlinked outside", (t) => {
  const container = mkdtempSync(join(tmpdir(), "extend-pack-"));
  const dir = join(container, "project");
  try {
    mkdirSync(dir);
    assert.equal(runCli(["init"], dir).status, 0);
    mkdirSync(join(container, "outside"));
    writeFileSync(join(container, "outside", "secret.js"), "export const secret = true;");
    try {
      symlinkSync(join(container, "outside"), join(dir, "linked"), "dir");
    } catch (err) {
      t.skip(`symlinks are unavailable: ${err.message}`);
      return;
    }
    addPackConfig(dir, "pack:\n  include:\n    - linked/secret.js");
    const result = runCli(["pack"], dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /points outside/);
    assert.ok(!existsSync(join(dir, "dist", "my-extension.zip")));
  } finally {
    clean(container);
  }
});

test("pack follows --config and includes an entry point outside src", () => {
  const dir = mkdtempSync(join(tmpdir(), "extend-pack-"));
  try {
    mkdirSync(join(dir, "lib"));
    writeFileSync(join(dir, "lib", "index.js"), "export const blocks = {};");
    writeFileSync(join(dir, "lib", "helper.js"), "export const helper = 1;");
    writeFileSync(join(dir, "custom.yml"), 'name: "Outside Entry"\nentryPoint: "lib/index.js"\n');
    const result = runCli(["pack", "-c", "custom.yml"], dir);
    assert.equal(result.status, 0, result.stderr);
    const output = join(dir, "dist", "outside-entry.zip");
    assert.deepEqual(names(readZip(output)), ["custom.yml", "lib/helper.js", "lib/index.js"]);
  } finally {
    clean(dir);
  }
});

test("pack does not execute the entry point", () => {
  const dir = tmpProject();
  try {
    writeFileSync(
      join(dir, "src", "index.js"),
      'import { writeFileSync } from "node:fs";\nwriteFileSync("ran.txt", "");\nexport const blocks = {};\n',
    );
    const result = runCli(["pack"], dir);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!existsSync(join(dir, "ran.txt")));
  } finally {
    clean(dir);
  }
});

test("pack reports an invalid include setting", () => {
  const dir = tmpProject();
  try {
    addPackConfig(dir, 'pack:\n  include: "src"');
    const result = runCli(["pack"], dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /pack\.include/);
    assert.ok(!existsSync(join(dir, "dist", "my-extension.zip")));
  } finally {
    clean(dir);
  }
});
