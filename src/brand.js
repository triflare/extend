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
