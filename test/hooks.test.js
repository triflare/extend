import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));

function runCli(args, cwd) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
}

function tmpProject() {
  return mkdtempSync(join(tmpdir(), "extend-hooks-"));
}

function initProject() {
  const dir = tmpProject();
  const init = runCli(["init"], dir);
  assert.equal(init.status, 0, init.stderr);
  return dir;
}

function clean(dir) {
  rmSync(dir, { recursive: true, force: true });
}

function appendConfig(dir, yaml) {
  const path = join(dir, "extend.yml");
  writeFileSync(path, `${readFileSync(path, "utf8")}\n${yaml}\n`);
}

function script(dir, name, source) {
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(join(dir, "scripts", name), source);
}

function hookLines(dir) {
  try {
    return readFileSync(join(dir, "hook-runs.log"), "utf8").trim().split("\n").length;
  } catch {
    return 0;
  }
}

function startDev(dir) {
  const child = spawn(process.execPath, [cli, "dev", "--port", "0"], {
    cwd: dir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const state = { stdout: "", stderr: "" };
  child.stdout.on("data", (chunk) => (state.stdout += chunk));
  child.stderr.on("data", (chunk) => (state.stderr += chunk));
  const served = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`dev never served a URL\n${state.stdout}${state.stderr}`)),
      20000,
    );
    const look = () => {
      const match = state.stdout.match(/Preview ready at (http:\/\/\S+?)\/extension\.js/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    };
    child.stdout.on("data", look);
    child.on("close", (code) => {
      clearTimeout(timer);
      reject(new Error(`dev exited with ${code}\n${state.stdout}${state.stderr}`));
    });
  });
  return { child, state, served };
}

function stopDev(dev) {
  return new Promise((resolve) => {
    if (dev.child.exitCode !== null) {
      resolve();
      return;
    }
    dev.child.once("close", () => resolve());
    dev.child.kill("SIGINT");
    setTimeout(() => dev.child.kill("SIGKILL"), 3000).unref();
  });
}

async function waitFor(check, message, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 50));
  }
  throw new Error(message);
}

async function body(url) {
  return (await fetch(url)).text();
}

test("build runs after hooks with the resolved output path", () => {
  const dir = initProject();
  try {
    script(
      dir,
      "stamp.js",
      [
        'import { appendFileSync } from "node:fs";',
        'appendFileSync("hook-runs.log", `${process.env.EXTEND_PHASE} ${process.env.EXTEND_OUTPUT}\\n`);',
        'appendFileSync(process.env.EXTEND_OUTPUT, "\\n// stamped\\n");',
      ].join("\n"),
    );
    appendConfig(dir, "build:\n  after:\n    - node scripts/stamp.js");
    const out = join(dir, "custom", "bundle.js");
    const result = runCli(["build", "-o", out], dir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(out, "utf8"), /\/\/ stamped\n$/);
    assert.equal(readFileSync(join(dir, "hook-runs.log"), "utf8"), `after ${out}\n`);
  } finally {
    clean(dir);
  }
});

test("hooks run in the order they are listed", () => {
  const dir = initProject();
  try {
    for (const letter of ["A", "B"]) {
      script(
        dir,
        `${letter}.js`,
        [
          'import { appendFileSync } from "node:fs";',
          `appendFileSync("hook-runs.log", "${letter}");`,
          `appendFileSync(process.env.EXTEND_OUTPUT, "${letter}");`,
        ].join("\n"),
      );
    }
    appendConfig(dir, "build:\n  after:\n    - node scripts/A.js\n    - node scripts/B.js");
    const result = runCli(["build"], dir);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(dir, "hook-runs.log"), "utf8"), "AB");
    assert.match(readFileSync(join(dir, "dist", "extension.js"), "utf8"), /AB$/);
  } finally {
    clean(dir);
  }
});

test("before hooks can generate the files validation needs", () => {
  const dir = tmpProject();
  try {
    writeFileSync(join(dir, "package.json"), '{"type":"module"}');
    writeFileSync(
      join(dir, "extend.yml"),
      [
        'name: "generated"',
        'version: "1.0.0"',
        'entryPoint: "src/index.js"',
        "extension:",
        '  id: "generated"',
        "blocks:",
        "  - opcode: made",
        "    blockType: reporter",
        '    text: "made"',
        "",
      ].join("\n"),
    );
    script(
      dir,
      "generate.js",
      [
        'import { mkdirSync, writeFileSync } from "node:fs";',
        'mkdirSync("src", { recursive: true });',
        'writeFileSync("src/index.js", \'export const blocks = { made: () => "made" };\\n\');',
      ].join("\n"),
    );

    const missing = runCli(["build"], dir);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /entry point/i);

    appendConfig(dir, "build:\n  before:\n    - node scripts/generate.js");
    const built = runCli(["build"], dir);
    assert.equal(built.status, 0, built.stderr);
    assert.match(readFileSync(join(dir, "dist", "extension.js"), "utf8"), /"made"/);
  } finally {
    clean(dir);
  }
});

test("a failing before hook stops the build before anything is written", () => {
  const dir = initProject();
  try {
    script(dir, "fail.js", 'console.error("could not generate");\nprocess.exit(1);\n');
    appendConfig(dir, "build:\n  before:\n    - node scripts/fail.js");
    const result = runCli(["build"], dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /build\.before command "node scripts\/fail\.js" failed/);
    assert.ok(!existsSync(join(dir, "dist", "extension.js")));
  } finally {
    clean(dir);
  }
});

test("a failing after hook fails the build", () => {
  const dir = initProject();
  try {
    script(dir, "fail.js", 'console.error("could not inline");\nprocess.exit(1);\n');
    appendConfig(dir, "build:\n  after:\n    - node scripts/fail.js");
    const result = runCli(["build"], dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /build\.after command "node scripts\/fail\.js" failed/);
  } finally {
    clean(dir);
  }
});

test("validate and pack leave hooks alone", () => {
  const dir = initProject();
  try {
    script(
      dir,
      "mark.js",
      'import { writeFileSync } from "node:fs";\nwriteFileSync("hook-runs.log", "ran\\n");\n',
    );
    appendConfig(dir, "build:\n  after:\n    - node scripts/mark.js");
    assert.equal(runCli(["validate"], dir).status, 0);
    assert.ok(!existsSync(join(dir, "hook-runs.log")));
    assert.equal(runCli(["pack"], dir).status, 0);
    assert.ok(!existsSync(join(dir, "hook-runs.log")));
  } finally {
    clean(dir);
  }
});

test("a malformed build setting is named", () => {
  const dir = initProject();
  try {
    appendConfig(dir, 'build:\n  after: "node scripts/inline.js"');
    const result = runCli(["build"], dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /build\.after/);
  } finally {
    clean(dir);
  }
});

test("a phase that isn't before or after is rejected", () => {
  const dir = initProject();
  try {
    appendConfig(dir, "build:\n  afterAll:\n    - node scripts/inline.js");
    const result = runCli(["build"], dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /build" has unknown field "afterAll"/);
  } finally {
    clean(dir);
  }
});

test("dev runs hooks and settles when one regenerates a source file", async () => {
  const dir = initProject();
  try {
    script(
      dir,
      "gen.js",
      [
        'import { appendFileSync, writeFileSync } from "node:fs";',
        'appendFileSync("hook-runs.log", "run\\n");',
        'writeFileSync("src/generated.js", "export const generated = 1;\\n");',
      ].join("\n"),
    );
    appendConfig(dir, "build:\n  before:\n    - node scripts/gen.js");

    const dev = startDev(dir);
    try {
      const url = await dev.served;
      assert.match(await body(`${url}/extension.js`), /Hello TurboWarp!/);
      await waitFor(
        () => hookLines(dir) >= 1,
        `the initial hook never ran\n${dev.state.stdout}${dev.state.stderr}`,
      );
      await new Promise((done) => setTimeout(done, 2000));
      const settled = hookLines(dir);
      await new Promise((done) => setTimeout(done, 2000));
      assert.equal(
        hookLines(dir),
        settled,
        `the regenerated file kept triggering rebuilds\n${dev.state.stdout}${dev.state.stderr}`,
      );

      writeFileSync(
        join(dir, "src/blocks/hello.js"),
        'export function hello() {\n  return "Edited.";\n}\n',
      );
      await waitFor(
        async () => (await body(`${url}/extension.js`)).includes("Edited."),
        `the edit never reached the server\n${dev.state.stdout}${dev.state.stderr}`,
      );
      await waitFor(
        () => hookLines(dir) > settled,
        `the rebuild never ran the hook\n${dev.state.stdout}${dev.state.stderr}`,
      );
      const rebuilt = hookLines(dir);
      await new Promise((done) => setTimeout(done, 2000));
      assert.equal(
        hookLines(dir),
        rebuilt,
        `the regenerated file kept triggering rebuilds after the edit\n${dev.state.stdout}${dev.state.stderr}`,
      );
    } finally {
      await stopDev(dev);
    }
  } finally {
    clean(dir);
  }
});

test("dev keeps the last good preview when an after hook fails", async () => {
  const dir = initProject();
  try {
    script(
      dir,
      "maybe-fail.js",
      [
        'import { existsSync } from "node:fs";',
        'if (existsSync("fail.txt")) {',
        '  console.error("the after hook failed");',
        "  process.exit(1);",
        "}",
      ].join("\n"),
    );
    appendConfig(dir, "build:\n  after:\n    - node scripts/maybe-fail.js");

    const dev = startDev(dir);
    try {
      const url = await dev.served;
      assert.match(await body(`${url}/extension.js`), /Hello TurboWarp!/);

      writeFileSync(join(dir, "fail.txt"), "");
      writeFileSync(
        join(dir, "src/blocks/hello.js"),
        'export function hello() {\n  return "Broken build.";\n}\n',
      );
      await waitFor(
        async () => dev.state.stderr.includes("hit a problem while building"),
        `the hook failure was never reported\n${dev.state.stdout}${dev.state.stderr}`,
      );
      const served = await body(`${url}/extension.js`);
      assert.match(served, /Hello TurboWarp!/, "the last good build should still be served");
      assert.doesNotMatch(served, /Broken build\./);

      rmSync(join(dir, "fail.txt"));
      writeFileSync(
        join(dir, "src/blocks/hello.js"),
        'export function hello() {\n  return "Recovered.";\n}\n',
      );
      await waitFor(
        async () => (await body(`${url}/extension.js`)).includes("Recovered."),
        `the fix never reached the server\n${dev.state.stdout}${dev.state.stderr}`,
      );
    } finally {
      await stopDev(dev);
    }
  } finally {
    clean(dir);
  }
});
