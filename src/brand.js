import { styleText } from "node:util";
import { loadProduct } from "./config.js";

// Every user-facing name, command, and filename comes from product.yml. A
// rebrand is a one-file change, and a stale literal can't survive a rename.
export function brand() {
  return loadProduct();
}

export function productName() {
  return brand().name;
}

export function commandName() {
  return brand().command;
}

export function configFilename() {
  return brand().defaults?.configFilename ?? "extend.yml";
}

export function defaultPort() {
  return brand().defaults?.devPort;
}

const FALLBACK_COLORS = {
  primary: "#E8590C",
  secondary: "#BA470A",
  tertiary: "#8B3507",
};

export function brandingColors(product = brand()) {
  const colors = product.branding?.colors ?? {};
  return {
    primary: colors.primary ?? FALLBACK_COLORS.primary,
    secondary: colors.secondary ?? FALLBACK_COLORS.secondary,
    tertiary: colors.tertiary ?? FALLBACK_COLORS.tertiary,
  };
}

// Paints a product name or command in three equal bands taken straight from the
// logo palette. styleText drops the colors when the stream can't render them,
// so piped output and CI logs stay plain text.
export function brandText(text, stream = process.stdout) {
  const { primary, secondary, tertiary } = brandingColors();
  const palette = [primary, secondary, tertiary];
  const chars = Array.from(text);
  if (chars.length === 0) return text;

  const bandFor = (index) =>
    Math.min(palette.length - 1, Math.floor((index * palette.length) / chars.length));
  const runs = [];
  let start = 0;
  for (let index = 1; index <= chars.length; index += 1) {
    if (index === chars.length || bandFor(index) !== bandFor(start)) {
      runs.push(styleText(palette[bandFor(start)], chars.slice(start, index).join(""), { stream }));
      start = index;
    }
  }
  return runs.join("");
}
