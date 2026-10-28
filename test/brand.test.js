import { test } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { brandText, brandingColors } from "../src/brand.js";

const plainStream = () =>
  new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });

test("brandingColors reads the logo palette", () => {
  assert.deepEqual(brandingColors(), {
    primary: "#E8590C",
    secondary: "#BA470A",
    tertiary: "#8B3507",
  });
});

test("brandText paints text with each brand color", () => {
  const previous = process.env.FORCE_COLOR;
  process.env.FORCE_COLOR = "1";
  try {
    const text = brandText("Extend");
    assert.ok(text.includes("\x1b[38;2;232;89;12m"));
    assert.ok(text.includes("\x1b[38;2;186;71;10m"));
    assert.ok(text.includes("\x1b[38;2;139;53;7m"));
  } finally {
    if (previous === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = previous;
  }
});

test("brandText stays plain text when the stream can't show color", () => {
  assert.equal(brandText("Triflare Extend", plainStream()), "Triflare Extend");
});
