import { apiRequest, extensionPath } from "../api.js";
import { readProjectConfig } from "../project.js";
import { extensionIdFrom, remoteContext } from "../remote.js";

export async function unpublishCommand(product, configPath, version, values, log) {
  if (!version) {
    log.error("Which version? Try 'extend unpublish 1.0.0'.");
    return false;
  }

  let config;
  try {
    config = readProjectConfig(configPath);
  } catch (err) {
    log.error(err.message);
    return false;
  }

  let id;
  let context;
  try {
    id = extensionIdFrom(config);
    context = await remoteContext(product, values);
  } catch (err) {
    log.error(err.message);
    return false;
  }
  const { apiUrl, token, namespace } = context;

  try {
    await apiRequest(
      apiUrl,
      `${extensionPath(namespace, id)}/versions/${encodeURIComponent(version)}`,
      { method: "DELETE", token },
    );
  } catch (err) {
    log.error(err.message);
    return false;
  }

  log.success(`Yanked @${namespace}/${id}@${version}.`);
  log.raw("  It's hidden from listings and search, but projects already using it still load.");
  return true;
}
