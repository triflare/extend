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
