import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTarGzip } from "../src/tar.js";

// The registry unpacks the upload with a real tar implementation, so the check
// here is the same one: hand it to tar and read the files back.
const systemTar = spawnSync("tar", ["--version"], { encoding: "utf8" });
const hasTar = systemTar.status === 0;

function extract(entries) {
  const dir = mkdtempSync(join(tmpdir(), "extend-tar-"));
  mkdirSync(join(dir, "out"), { recursive: true });
  writeFileSync(join(dir, "project.tar.gz"), createTarGzip(entries));
  const result = spawnSync("tar", ["-xzf", join(dir, "project.tar.gz"), "-C", join(dir, "out")], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return { dir, out: join(dir, "out"), result };
}

test("the archive extracts with the files and bytes that went in", (t) => {
  if (!hasTar) {
    t.skip("tar is not installed");
    return;
  }
  const entries = [
    { name: "extend.yml", data: Buffer.from("entryPoint: src/index.js\n"), mtime: new Date() },
    { name: "src/index.js", data: Buffer.from("export const blocks = {};\n"), mtime: new Date() },
    { name: "package.json", data: Buffer.from('{ "type": "module" }\n'), mtime: new Date() },
  ];
  const { dir, out } = extract(entries);
  try {
    for (const entry of entries) {
      assert.deepEqual(readFileSync(join(out, entry.name)), entry.data, entry.name);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a path past ustar's 100-byte name field keeps its prefix", (t) => {
  if (!hasTar) {
    t.skip("tar is not installed");
    return;
  }
  const name = `src/${"very/nested/".repeat(12)}block.js`;
  assert.ok(Buffer.byteLength(name) > 100, "the path has to be long enough to split");
  const { dir, out } = extract([
    { name, data: Buffer.from("export const x = 1;\n"), mtime: new Date() },
  ]);
  try {
    assert.deepEqual(readFileSync(join(out, name)), Buffer.from("export const x = 1;\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an entry that is not a multiple of 512 bytes is padded, not truncated", (t) => {
  if (!hasTar) {
    t.skip("tar is not installed");
    return;
  }
  const data = Buffer.alloc(700, 7);
  const { dir, out } = extract([{ name: "src/blob.bin", data, mtime: new Date() }]);
  try {
    assert.deepEqual(readFileSync(join(out, "src/blob.bin")), data);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
