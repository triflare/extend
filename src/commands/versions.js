import { apiRequest, extensionPath } from "../api.js";
import { readProjectConfig } from "../project.js";
import { extensionIdFrom, remoteContext } from "../remote.js";

const STATUSES = new Set(["staging", "pending", "published", "rejected", "yanked", "deprecated"]);

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export async function versionsCommand(product, configPath, values, log) {
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
    context = await remoteContext(product, values, config);
  } catch (err) {
    log.error(err.message);
    return false;
  }
  const { apiUrl, token, namespace } = context;

  if (values.status !== undefined && !STATUSES.has(values.status)) {
    log.error(`--status must be one of: ${[...STATUSES].join(", ")}.`);
    return false;
  }

  const query = values.status ? `?status=${encodeURIComponent(values.status)}` : "";
  let versions;
  try {
    ({ data: versions } = await apiRequest(
      apiUrl,
      `${extensionPath(namespace, id)}/versions${query}`,
      { token },
    ));
  } catch (err) {
    log.error(err.message);
    return false;
  }

  const rows = versions.data ?? [];
  if (rows.length === 0) {
    log.info(
      values.status
        ? `@${namespace}/${id} has no versions marked ${values.status}.`
        : `@${namespace}/${id} has no published versions yet.`,
    );
    return true;
  }

  log.info(`@${namespace}/${id}`);
  for (const row of rows) {
    const parts = [row.version.padEnd(14), row.status.padEnd(11)];
    const published = formatDate(row.publishedAt);
    if (published) parts.push(published);
    parts.push(`${row.downloads ?? 0} downloads`);
    log.raw(`  ${parts.join("  ")}`);
    if (row.rejectionReason) log.raw(`    ${row.rejectionReason}`);
    if (row.deprecation) log.raw(`    ${row.deprecation}`);
  }
  return true;
}
