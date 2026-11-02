import { EXTENSION_ID_PATTERN } from "./validate.js";

// SemVer's own grammar, minus the "v" prefix and loose forms the registry also
// refuses. A local check cannot know the highest published version, so this
// only catches what is malformed before the upload.
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// The registry derives what it stores from extend.yml and refuses the upload on
// the same problems, so checking here saves a round trip and names the line the
// extension author has to fix.
export function manifestFromProject(config) {
  const errors = [];
  const extension =
    config?.extension && typeof config.extension === "object" ? config.extension : {};
  const id = extension.id;

  if (typeof id !== "string" || !EXTENSION_ID_PATTERN.test(id)) {
    errors.push('"extension.id" must be lowercase letters and digits, at most 64 characters.');
  }
  if (typeof config?.version !== "string" || !SEMVER_PATTERN.test(config.version)) {
    errors.push('Set "version" to a SemVer version such as 1.2.0.');
  }
  if (
    config?.license !== undefined &&
    (typeof config.license !== "string" || config.license.trim() === "")
  ) {
    errors.push('"license" must be an SPDX identifier when you set it.');
  }
  for (const field of ["name", "description", "author"]) {
    if (config?.[field] !== undefined && typeof config[field] !== "string") {
      errors.push(`"${field}" must be text when you set it.`);
    }
  }
  if (extension.isUnsandboxed !== undefined && typeof extension.isUnsandboxed !== "boolean") {
    errors.push('"extension.isUnsandboxed" must be true or false.');
  }
  for (const color of ["color1", "color2", "color3"]) {
    if (extension[color] !== undefined && !COLOR_PATTERN.test(String(extension[color]))) {
      errors.push(`"extension.${color}" must be a color such as "#E8590C".`);
    }
  }

  if (errors.length > 0) return { errors, manifest: null };
  return {
    errors,
    manifest: {
      id,
      name: config.name ?? extension.name ?? id,
      version: config.version,
      license: config.license ?? "MIT",
      description: config.description ?? "",
      author: config.author ?? null,
    },
  };
}
