import { brandText } from "../brand.js";
import { apiRequest, resolveApiUrl, savedCredentials } from "../api.js";
import { writeCredentials } from "../credentials.js";

const CLIENT_NAME_MAX = 80;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loginCommand(product, values, log) {
  let apiUrl;
  try {
    // Signing in again after an expiry lands on the instance already saved.
    apiUrl = resolveApiUrl(product, null, values.api, savedCredentials(product));
  } catch (err) {
    log.error(err.message);
    return false;
  }

  const clientName = (product.marketplace?.clientName ?? product.name ?? "extend").slice(
    0,
    CLIENT_NAME_MAX,
  );

  log.progress(`Asking ${apiUrl} for a sign-in code...`);
  let pending;
  try {
    const response = await apiRequest(apiUrl, "/auth/device/code", {
      method: "POST",
      body: { clientName },
      timeoutMs: 15000,
    });
    pending = response.data;
  } catch (err) {
    if (err.status === 404) {
      log.error(`${apiUrl} doesn't offer device sign-in, so this can't sign you in.`);
      return false;
    }
    log.error(err.message);
    return false;
  }

  log.success(`Open ${pending.verificationUriComplete ?? pending.verificationUri} to approve.`);
  log.raw(`  Code: ${pending.userCode}`);
  log.raw(`  This code expires in ${Math.round(pending.expiresIn / 60)} minutes.`);

  const deadline = Date.now() + pending.expiresIn * 1000;
  let wait = Math.max(1, pending.interval) * 1000;
  while (Date.now() < deadline) {
    await sleep(wait);
    try {
      const response = await apiRequest(apiUrl, "/auth/device/token", {
        method: "POST",
        body: { deviceCode: pending.deviceCode },
        timeoutMs: 15000,
      });
      const { token, user, session } = response.data;
      const path = writeCredentials(product, {
        apiUrl,
        token,
        kind: "session",
        namespace: user.namespace,
        issuedAt: new Date().toISOString(),
        expiresAt: session?.expiresAt ?? null,
      });
      log.success(`Signed in as @${user.namespace} (${brandText(product.name)}).`);
      log.raw(`  Your sign-in is saved at ${path}.`);
      return true;
    } catch (err) {
      const reason = err.problem?.error;
      if (reason === "authorization_pending") continue;
      if (reason === "slow_down") {
        wait += 5000;
        continue;
      }
      if (reason === "access_denied") {
        log.error("That sign-in was declined. Nothing was saved.");
        return false;
      }
      if (reason === "expired_token") {
        log.error("That code is no longer valid. Run the sign-in again for a fresh one.");
        return false;
      }
      log.error(err.message);
      return false;
    }
  }

  log.error("The code expired before it was approved. Run the sign-in again for a fresh one.");
  return false;
}
