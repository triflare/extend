# Contributing to Triflare Extend

Thank you for contributing to Triflare Extend! Now, here are the technical bits:

Extend is a Node.js CLI with no build step. The source in `src/` runs as-is, so you can test a change with the same command people use after installing the package.

## Set up

You need Node.js 24 or newer and npm.

```bash
git clone https://github.com/triflare/extend.git
cd extend
npm install
```

## Run the CLI

You can run the CLI like everybody else by running `npm link`:

```bash
npm link
extend help
```

## Project layout

| Path                | What it does                                                                |
| ------------------- | --------------------------------------------------------------------------- |
| `src/cli.js`        | Argument parsing, command dispatch, and the help text.                      |
| `src/commands/`     | One file per command. Each returns whether it succeeded.                    |
| `src/compile.js`    | Turns a validated project into the extension file.                          |
| `src/validate.js`   | Checks the manifest, blocks, arguments, and handler references.             |
| `src/project.js`    | Reads `extend.yml` and imports the entry point.                             |
| `src/brand.js`      | Reads the product name, command, palette, and config filename.              |
| `src/config.js`     | Loads `product.yml`.                                                        |
| `src/log.js`        | The Consola reporter used by every command.                                 |
| `product.yml`       | Name, command, version, tagline, palette, log symbols, and defaults.        |
| `test/`             | The test suite.                                                             |
| `test-fixtures/`    | Projects the tests build and validate against.                              |
| `schema/`, `types/` | The editor schema for `extend.yml` and the typings for entry point modules. |

`product.yml` drives user-visible output and the defaults used by new projects. If you change a value there, update `test/config.test.js` and any command test that depends on it.

## Tests

The suite uses Node's built-in test runner:

```bash
npm test
```

Run one file the same way:

```bash
node --test test/compile.test.js
```

Tests that need a project on disk use `test-fixtures/`. Add a fixture when a test needs a realistic project instead of writing the same YAML into a temporary directory again.

## Code style

The project uses Prettier for formatting and ESLint for linting. Both run on the whole repository.

```bash
npm run format
npm run lint
```

Run the full check before you push. It verifies formatting without rewriting files, then runs the linter and the tests:

```bash
npm run check
```

The source is plain ESM. Prefer Node built-ins over new dependencies, and match the style of the file you are changing.

## Commits

Use a conventional prefix and a short, imperative subject:

```text
feat: add a menu entry for the settings page
fix: keep color2 out of getInfo when it is unset
docs: rewrite the configuration reference
refactor: move manifest checks into validate.js
chore: bump the ESLint config
```

Add `!` when a change breaks existing projects or command usage, for example `feat!: rename the config file`. Put the reason and migration notes in the body.

## Pull requests

Branch from `develop`, keep the change focused, and include tests for behavior changes. Before opening a pull request, run:

```bash
npm run check
```

CI runs lint, formatting, and tests on Node.js 24. In the pull request, describe what changed, why it changed, and how you tested it.

## Releases

Bump the version in both `package.json` and `product.yml`, then push a matching v-prefixed tag, such as `v0.1.0`. That push is what triggers publication: the CD workflow runs on the tag and publishes to npm. Check the publish run afterwards to confirm the release went out.
