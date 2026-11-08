import { apiRequest, resolveApiUrl, tokenFor } from "../api.js";
import { clearCredentials, readCredentials } from "../credentials.js";

export async function logoutCommand(product, values, log) {
  let credentials;
  try {
    credentials = readCredentials(product);
  } catch (err) {
    log.error(err.message);
    return false;
  }
  if (!credentials) {
    log.info("You're not signed in, so there's nothing to sign out of.");
    return true;
  }

  let apiUrl;
  try {
    apiUrl = credentials.apiUrl ?? resolveApiUrl(product, values.api);
  } catch (err) {
    log.error(err.message);
    return false;
  }

  const { token } = tokenFor(product, values, apiUrl);
  if (token) {
    // A session and an automation token are revoked by different routes, and
    // each only deletes the caller's own row.
    const path = credentials.kind === "token" ? "/tokens/current" : "/sessions/current";
    try {
      await apiRequest(apiUrl, path, { method: "DELETE", token });
    } catch (err) {
      if (err.status !== 401) log.warn(`We couldn't end the sign-in on the server: ${err.message}`);
    }
  }

  clearCredentials(product);
  log.success("Signed out. The saved sign-in is gone from this machine.");
  return true;
}
