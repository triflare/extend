import { gzipSync } from "node:zlib";

const BLOCK = 512;
const FILE_MODE = 0o644;
const USTAR = "ustar";

function octal(value, width) {
  return `${Math.max(0, Math.trunc(value))
    .toString(8)
    .padStart(width - 1, "0")}\0`;
}

// ustar splits a long path into a prefix and a 100-byte name, and only at a
// slash. Both halves are byte-limited, so the split has to count UTF-8 bytes.
function splitName(name) {
  const full = Buffer.byteLength(name);
  if (full <= 100) return { prefix: "", base: name };

  for (let index = name.length - 1; index > 0; index -= 1) {
    if (name[index] !== "/") continue;
    const prefix = name.slice(0, index);
    const base = name.slice(index + 1);
    if (Buffer.byteLength(base) <= 100 && Buffer.byteLength(prefix) <= 155 && base.length > 0) {
      return { prefix, base };
    }
  }
  throw new Error(`The path "${name}" is too long for a tar archive.`);
}

function header(name, size, mtime) {
  const { prefix, base } = splitName(name);
  const block = Buffer.alloc(BLOCK);

  block.write(base, 0, 100, "utf8");
  block.write(octal(FILE_MODE, 8), 100, "ascii");
  block.write(octal(0, 8), 108, "ascii");
  block.write(octal(0, 8), 116, "ascii");
  block.write(octal(size, 12), 124, "ascii");
  block.write(octal(Math.floor(mtime / 1000), 12), 136, "ascii");
  // The checksum is computed over the header with this field read as spaces.
  block.fill(" ", 148, 156);
  block.write("0", 156, "ascii");
  block.write(`${USTAR}\0`, 257, "ascii");
  block.write("00", 263, "ascii");
  block.write(prefix, 345, 155, "utf8");

  let checksum = 0;
  for (const byte of block) checksum += byte;
  block.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
  return block;
}

export function createTar(entries) {
  const parts = [];
  for (const { name, data, mtime } of entries) {
    parts.push(header(name, data.length, mtime));
    parts.push(data);
    const remainder = data.length % BLOCK;
    if (remainder !== 0) parts.push(Buffer.alloc(BLOCK - remainder));
  }
  // Two zero blocks end the archive; padding the tail is what every extractor
  // expects, not a detail of ours.
  parts.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(parts);
}

export function createTarGzip(entries) {
  return gzipSync(createTar(entries));
}
