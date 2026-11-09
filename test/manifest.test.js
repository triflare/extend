import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestFromProject } from "../src/manifest.js";

const base = {
  name: "super-utilities",
  version: "1.2.3",
  description: "Utility blocks",
  author: "Kane Boswell",
  license: "MIT",
  entryPoint: "src/index.js",
  extension: { id: "superutilities", name: "Super Utilities" },
  blocks: [{ opcode: "hello", blockType: "command", text: "hello" }],
};

test("a publishable project becomes the manifest the registry stores", () => {
  const { errors, manifest } = manifestFromProject(base);
  assert.deepEqual(errors, []);
  assert.equal(manifest.id, "superutilities");
  assert.equal(manifest.version, "1.2.3");
  assert.equal(manifest.license, "MIT");
  assert.equal(manifest.name, "super-utilities");
});

test("a missing license falls back to MIT", () => {
  const { manifest } = manifestFromProject({ ...base, license: undefined });
  assert.equal(manifest.license, "MIT");
});

test("ids must be lowercase letters and digits", () => {
  for (const id of ["SuperUtilities", "super-utilities", "", "a".repeat(65), undefined]) {
    const { errors, manifest } = manifestFromProject({
      ...base,
      extension: { ...base.extension, id },
    });
    assert.equal(manifest, null, `id ${String(id)} should be refused`);
    assert.match(errors.join("\n"), /extension\.id/);
  }
});

test("the version has to be SemVer", () => {
  for (const version of ["1.0", "v1.0.0", "01.0.0", "", undefined]) {
    const { errors } = manifestFromProject({ ...base, version });
    assert.match(errors.join("\n"), /SemVer/);
  }
  for (const version of ["1.0.0", "1.0.0-beta.1", "2.0.0+build.5"]) {
    const { errors } = manifestFromProject({ ...base, version });
    assert.deepEqual(errors, [], version);
  }
});

test("fields with the wrong type are named", () => {
  const { errors } = manifestFromProject({
    ...base,
    license: "",
    name: 4,
    extension: { ...base.extension, isUnsandboxed: "yes", color1: "red" },
  });
  const text = errors.join("\n");
  assert.match(text, /"license"/);
  assert.match(text, /"name"/);
  assert.match(text, /isUnsandboxed/);
  assert.match(text, /color1/);
});
