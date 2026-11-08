import { apiRequest } from "../api.js";
import { remoteContext } from "../remote.js";

const DEFAULT_NAME = "extend CLI";

// A token belongs to an account, not a project, so this works outside one and
// never reads the project config.
export async function tokenCommand(product, action, values, log) {
  if (action !== "create") {
    log.error("Try 'extend token create --scopes publish,yank'.");
    return false;
  }

  const scopes = (values.scopes ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  if (scopes.length === 0) {
    log.error("Name at least one scope, for example --scopes publish,yank.");
    return false;
  }

  let expiresInDays;
  if (values.expires !== undefined) {
    expiresInDays = Number(values.expires);
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1) {
      log.error("--expires takes a whole number of days.");
      return false;
    }
  }

  let context;
  try {
    context = await remoteContext(product, values);
  } catch (err) {
    log.error(err.message);
    return false;
  }
  const { apiUrl, token } = context;

  let created;
  try {
    ({ data: created } = await apiRequest(apiUrl, "/tokens", {
      method: "POST",
      token,
      body: { name: values.name ?? DEFAULT_NAME, scopes, expiresInDays },
      timeoutMs: 15000,
    }));
  } catch (err) {
    log.error(err.message);
    return false;
  }

  log.success(`Created the token "${created.name}" (${created.scopes.join(", ")}).`);
  log.raw(`  ${created.token}`);
  log.warn("That secret is shown once. Store it somewhere safe, such as TRIFLARE_TOKEN in CI.");
  return true;
}
