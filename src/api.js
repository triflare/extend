import { readCredentials } from "./credentials.js";

export class MarketplaceError extends Error {
  constructor(message, { status = 0, problem = null, requestId = null } = {}) {
    super(message);
    this.name = "MarketplaceError";
    this.status = status;
    this.problem = problem;
    this.requestId = requestId;
  }
} // A flag beats the environment, which beats the project, which beats the
// registry this machine is already signed in to, which beats the product.
// Without that fourth step a sign-in to a local instance looks like no sign-in
// at all to the next command. Keeping the default in product.yml means a
// rebrand moves it too.
export function resolveApiUrl(product, config, flag, credentials) {
  const url =
    flag ??
    process.env.TRIFLARE_API ??
    config?.marketplace?.api ??
    credentials?.apiUrl ??
    product.marketplace?.apiUrl;
  if (typeof url !== "string" || url.trim() === "") {
    throw new Error("We don't know which marketplace to talk to. Pass --api or set TRIFLARE_API.");
  }
  return url.trim().replace(/\/+$/, "");
}

function fieldLines(problem) {
  if (!Array.isArray(problem?.errors)) return [];
  return problem.errors.map((error) => {
    const at = error.pointer ?? error.field;
    return at ? `${at}: ${error.message}` : error.message;
  });
}

function problemMessage(status, problem, headers) {
  if (!problem || typeof problem !== "object") return `The marketplace answered ${status}.`;
  const lines = [problem.detail ?? problem.title ?? `The marketplace answered ${status}.`];
  lines.push(...fieldLines(problem));
  if (status === 429 && headers?.get("retry-after")) {
    lines.push(`Try again in ${headers.get("retry-after")} seconds.`);
  }
  return lines.join("\n");
}

export async function apiRequest(baseUrl, path, options = {}) {
  const {
    method = "GET",
    token = null,
    body = undefined,
    headers = {},
    timeoutMs = 30000,
  } = options;

  const requestHeaders = { accept: "application/json", ...headers };
  if (token) requestHeaders.authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof Uint8Array) {
    payload = body;
  } else if (body !== undefined) {
    requestHeaders["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: requestHeaders,
      body: payload,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      throw new MarketplaceError(
        `The marketplace didn't answer within ${Math.round(timeoutMs / 1000)} seconds.`,
        { status: 0 },
      );
    }
    const reason = err.cause?.code ?? err.cause?.message ?? err.message;
    throw new MarketplaceError(`We couldn't reach ${baseUrl}: ${reason}`, { status: 0 });
  }

  const requestId = response.headers.get("x-request-id");
  const type = response.headers.get("content-type") ?? "";
  let data;
  if (type.includes("json")) {
    data = await response.json().catch(() => null);
  } else {
    const text = await response.text().catch(() => "");
    data = text === "" ? null : text;
  }

  if (!response.ok) {
    throw new MarketplaceError(problemMessage(response.status, data, response.headers), {
      status: response.status,
      problem: typeof data === "object" ? data : null,
      requestId,
    });
  }

  return { status: response.status, data, headers: response.headers, requestId };
}

export function savedCredentials(product) {
  try {
    return readCredentials(product);
  } catch {
    return null;
  }
}

// The token belongs to whichever registry is being addressed. A sign-in saved
// for another host is not sent there, which is why the URL is checked first.
export function tokenFor(product, values, apiUrl, credentials = savedCredentials(product)) {
  const fromFlag = values.token ?? process.env.TRIFLARE_TOKEN;
  if (fromFlag) return { token: fromFlag, credentials: null };
  if (!credentials || credentials.apiUrl !== apiUrl) return { token: null, credentials };
  if (credentials.expiresAt && Date.parse(credentials.expiresAt) <= Date.now()) {
    return { token: null, credentials, expired: true };
  }
  return { token: credentials.token, credentials };
}

export function extensionPath(namespace, id) {
  return `/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}`;
}
