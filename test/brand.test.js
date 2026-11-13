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
    primary: "#FFA448",
    secondary: "#E67E22",
    tertiary: "#D46C10",
  });
});

test("brandText paints text with each brand color", () => {
  const previous = process.env.FORCE_COLOR;
  process.env.FORCE_COLOR = "1";
  try {
    const text = brandText("Extend");
    assert.ok(text.includes("\x1b[38;2;255;164;72m"));
    assert.ok(text.includes("\x1b[38;2;230;126;34m"));
    assert.ok(text.includes("\x1b[38;2;212;108;16m"));
  } finally {
    if (previous === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = previous;
  }
});

test("brandText stays plain text when the stream can't show color", () => {
  // node --test sets FORCE_COLOR when its own output is colorized, and
  // styleText honors it over the stream.
  const previous = process.env.FORCE_COLOR;
  delete process.env.FORCE_COLOR;
  try {
    assert.equal(brandText("Triflare Extend", plainStream()), "Triflare Extend");
  } finally {
    if (previous !== undefined) process.env.FORCE_COLOR = previous;
  }
});
