import { formatWithOptions, styleText } from "node:util";
import { createConsola } from "consola";

// Consola owns the streams, levels, and prompt UI, but the glyphs and colors
// stay ours: plain Unicode marks read better than emoji in every terminal.
const TYPES = {
  success: { symbol: "success", color: "green" },
  ready: { symbol: "success", color: "green" },
  error: { symbol: "error", color: "red" },
  fatal: { symbol: "error", color: "red" },
  fail: { symbol: "error", color: "red" },
  warn: { symbol: "progress", color: "yellow" },
  start: { symbol: "progress", dim: true },
  debug: { symbol: "bullet", color: "gray" },
  trace: { symbol: "bullet", color: "gray" },
  verbose: { symbol: "bullet", color: "gray" },
  info: {},
  log: {},
};

function stringify(args) {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return arg.stack ?? arg.message;
      return formatWithOptions({ colors: false }, arg);
    })
    .join(" ");
}

// styleText's own escape sequence for a color, so a line can be re-colored
// after a nested brand-colored word resets the foreground.
function colorOpen(color, stream) {
  const marker = "\u0000";
  const sample = styleText(color, marker, { stream });
  const index = sample.indexOf(marker);
  return index > 0 ? sample.slice(0, index) : "";
}

function formatLine(line, { color, dim }, stream) {
  let formatted = line;
  if (color) {
    const open = colorOpen(color, stream);
    formatted = styleText(color, formatted, { stream });
    if (open) {
      formatted = formatted.replaceAll("\x1b[39m", `\x1b[39m${open}`);
      if (formatted.endsWith(open)) formatted = formatted.slice(0, -open.length);
    }
  }
  if (dim) formatted = styleText("dim", formatted, { stream });
  return formatted;
}

function createReporter(product) {
  return {
    log(logObj, { options }) {
      const stream = logObj.level < 2 ? options.stderr : options.stdout;
      const type = TYPES[logObj.type] ?? {};
      const symbol = type.symbol ? product.symbols?.[type.symbol] : "";
      const text = stringify(logObj.args).trimEnd();
      if (!text) return;

      const output = text
        .split("\n")
        .map((line) => formatLine(symbol ? `${symbol} ${line}` : line, type, stream))
        .join("\n");
      stream.write(`${output}\n`);
    },
  };
}

export function createLogger(product) {
  const log = createConsola({ reporters: [createReporter(product)] });
  return {
    success: (message) => log.success(message),
    error: (message) => log.error(message),
    warn: (message) => log.warn(message),
    progress: (message) => log.start(message),
    bullet: (message) => log.log(`  ${product.symbols.bullet} ${message}`),
    info: (message) => log.info(message),
    raw: (message) => log.log(message),
  };
}
