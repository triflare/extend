import { spawn } from "node:child_process";

// Build hooks are opt-in: a project with no "build" section runs nothing. They
// exist for steps the compiler doesn't do, such as inlining a vendored library
// into the bundle after it is written.
export function readBuildHooks(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Your config file must contain a mapping");
  }
  const build = config.build ?? {};
  if (!build || typeof build !== "object" || Array.isArray(build)) {
    throw new Error('"build" must be a mapping');
  }
  const hooks = {};
  for (const phase of ["before", "after"]) {
    const commands = build[phase] ?? [];
    if (
      !Array.isArray(commands) ||
      commands.some((command) => typeof command !== "string" || command.trim() === "")
    ) {
      throw new Error(`"build.${phase}" must be a list of shell commands`);
    }
    hooks[phase] = commands;
  }
  return hooks;
}

// A command is run through the platform shell so scripts, pipes, and quoted
// arguments read the same as they would in package.json. The output path is
// passed in the environment because it can move with --out.
export function runBuildHook(phase, command, { root, output = null }) {
  return new Promise((finish) => {
    const env = { ...process.env, EXTEND_ROOT: root, EXTEND_PHASE: phase };
    if (output) env.EXTEND_OUTPUT = output;
    const child = spawn(command, { cwd: root, shell: true, stdio: "inherit", env });
    child.on("error", (err) => {
      finish(`The build.${phase} command "${command}" couldn't start: ${err.message}`);
    });
    child.on("close", (code, signal) => {
      if (code === 0) {
        finish(null);
        return;
      }
      finish(
        signal
          ? `The build.${phase} command "${command}" stopped with ${signal}.`
          : `The build.${phase} command "${command}" failed with exit code ${code}.`,
      );
    });
  });
}
