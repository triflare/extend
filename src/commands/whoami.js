import { apiRequest, resolveApiUrl, savedCredentials, tokenFor } from "../api.js";
import { signInMessage } from "../remote.js";

export async function whoamiCommand(product, values, log) {
  const credentials = savedCredentials(product);
  let apiUrl;
  try {
    apiUrl = resolveApiUrl(product, null, values.api, credentials);
  } catch (err) {
    log.error(err.message);
    return false;
  }

  const { token, expired } = tokenFor(product, values, apiUrl, credentials);
  if (!token) {
    log.error(signInMessage({ expired, credentials }, apiUrl));
    return false;
  }

  let user;
  try {
    ({ data: user } = await apiRequest(apiUrl, "/me", { token }));
  } catch (err) {
    log.error(err.message);
    return false;
  }

  log.success(`Signed in as @${user.namespace}.`);
  log.raw(`  Name: ${user.displayName}`);
  if (user.role === "admin") log.raw("  Role: admin");
  log.raw(`  Marketplace: ${apiUrl}`);

  // An instance without published Terms answers 404, and then there is nothing
  // to accept and no warning worth printing.
  let termsVersion = null;
  try {
    const terms = await apiRequest(apiUrl, "/terms", { token });
    termsVersion = terms.data?.version ?? null;
  } catch (err) {
    if (err.status !== 404) log.warn(`We couldn't read the Terms: ${err.message}`);
  }
  if (termsVersion !== null && user.termsAcceptedVersion !== termsVersion) {
    log.warn(`Accept the Terms (version ${termsVersion}) before you publish.`);
  }
  return true;
}
