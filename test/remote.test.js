import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveApiUrl } from "../src/api.js";
import { signInMessage } from "../src/remote.js";

const product = { marketplace: { apiUrl: "https://public.example/api/v1" } };
const saved = { apiUrl: "http://localhost:3000/v1", namespace: "demo" };

let previousApi;
beforeEach(() => {
  previousApi = process.env.TRIFLARE_API;
  delete process.env.TRIFLARE_API;
});
afterEach(() => {
  if (previousApi === undefined) delete process.env.TRIFLARE_API;
  else process.env.TRIFLARE_API = previousApi;
});

test("a saved sign-in is the default when nothing else names an instance", () => {
  assert.equal(resolveApiUrl(product, null, saved), "http://localhost:3000/v1");
  assert.equal(resolveApiUrl(product, null, null), "https://public.example/api/v1");
});

test("the flag and the environment beat the saved sign-in", () => {
  assert.equal(resolveApiUrl(product, "https://flag.example/v1", saved), "https://flag.example/v1");

  process.env.TRIFLARE_API = "https://env.example/v1";
  assert.equal(resolveApiUrl(product, null, saved), "https://env.example/v1");
  assert.equal(resolveApiUrl(product, null, null), "https://env.example/v1");
});

test("trailing slashes are dropped so paths do not double up", () => {
  assert.equal(
    resolveApiUrl(product, "http://localhost:3000/v1///", null),
    "http://localhost:3000/v1",
  );
});

test("only https, or http to a loopback host", () => {
  assert.throws(() => resolveApiUrl(product, "http://marketplace.example/v1", null), /https/);
  assert.throws(() => resolveApiUrl(product, "ftp://marketplace.example/v1", null), /https/);
  assert.equal(
    resolveApiUrl(product, "http://127.0.0.1:8080/v1", null),
    "http://127.0.0.1:8080/v1",
  );
  assert.equal(resolveApiUrl(product, "http://[::1]:8080/v1", null), "http://[::1]:8080/v1");
});

test("a URL that does not parse is refused", () => {
  assert.throws(() => resolveApiUrl(product, "not a url", null), /valid marketplace URL/);
});

test("a sign-in for another instance says so instead of claiming you are signed out", () => {
  assert.match(
    signInMessage({ expired: false, credentials: saved }, "https://public.example/api/v1"),
    /saved sign-in is for http:\/\/localhost:3000\/v1/,
  );
  assert.match(
    signInMessage({ expired: false, credentials: null }, "http://localhost:3000/v1"),
    /not signed in/,
  );
  assert.match(
    signInMessage({ expired: true, credentials: saved }, "http://localhost:3000/v1"),
    /expired/,
  );
});
