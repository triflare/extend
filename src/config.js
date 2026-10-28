import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

export function loadProduct() {
  const productPath = fileURLToPath(new URL("../product.yml", import.meta.url));
  return parse(readFileSync(productPath, "utf8")) ?? {};
}

export function getProduct() {
  return loadProduct();
}

export function productConfig() {
  const product = loadProduct();
  return {
    name: product.name,
    command: product.command,
    version: product.version,
    tagline: product.tagline,
    author: product.author,
    homepage: product.homepage,
    branding: product.branding ?? {},
    symbols: product.symbols ?? {},
    defaults: product.defaults ?? {},
  };
}
