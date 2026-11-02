import { apiRequest, resolveApiUrl, savedCredentials, tokenFor } from "./api.js";
import { EXTENSION_ID_PATTERN } from "./validate.js";

export async function whoami(apiUrl, token) {
  const { data } = await apiRequest(apiUrl, "/me", { token });
  return data;
}

export function signInMessage({ expired, credentials }, apiUrl) {
  if (expired) return "Your saved sign-in has expired. Run 'extend login' again.";
  if (credentials?.apiUrl) {
    return `Your saved sign-in is for ${credentials.apiUrl}. Run 'extend login --api ${apiUrl}' to sign in here.`;
  }
  return "You're not signed in. Run 'extend login' first, or set TRIFLARE_TOKEN.";
}

// Everything a remote command needs to address the registry, with the messages
// a developer can act on rather than the raw status.
export async function remoteContext(product, values, config) {
  const credentials = savedCredentials(product);
  const apiUrl = resolveApiUrl(product, config, values.api, credentials);
  const { token, expired } = tokenFor(product, values, apiUrl, credentials);
  if (!token) throw new Error(signInMessage({ expired, credentials }, apiUrl));
  const namespace =
    values.namespace ?? credentials?.namespace ?? (await whoami(apiUrl, token)).namespace;
  return { apiUrl, token, namespace };
}

export function extensionIdFrom(config) {
  const id = config?.extension?.id;
  if (typeof id !== "string" || !EXTENSION_ID_PATTERN.test(id)) {
    throw new Error(
      'Your config needs an "extension.id" of lowercase letters and digits, at most 64 characters.',
    );
  }
  return id;
}
