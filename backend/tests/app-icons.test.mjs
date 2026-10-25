import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createRequestHandler } from "../src/server.mjs";

const frontend = fileURLToPath(new URL("../../frontend/", import.meta.url));

async function responseFor(url) {
  const capture = { body: Buffer.alloc(0) };
  const response = { writeHead(status, headers) { capture.status = status; capture.headers = headers; }, end(chunk) { capture.body = Buffer.from(chunk ?? ""); } };
  await createRequestHandler(null)({ method: "GET", url, headers: { host: "localhost" }, async *[Symbol.asyncIterator]() {} }, response);
  return capture;
}

test("the logo and icons are served with their own media types", async () => {
  const expected = { "/icons/compass-mark.svg": "image/svg+xml", "/icons/icon-192.png": "image/png", "/icons/icon-512.png": "image/png", "/icons/apple-touch-icon.png": "image/png", "/icons/manifest.webmanifest": "application/manifest+json" };
  for (const [url, type] of Object.entries(expected)) {
    const { status, headers } = await responseFor(url);
    assert.equal(status, 200, url);
    assert.equal(headers["content-type"], type, url);
  }
});

test("PNG icons have the pixel sizes their links and manifest promise", async () => {
  for (const [file, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
    const bytes = await readFile(join(frontend, "icons", file));
    assert.equal(bytes.readUInt32BE(16), size, file);
    assert.equal(bytes.readUInt32BE(20), size, file);
  }
});

test("every icon the page and manifest reference exists in the frontend folder", async () => {
  const html = await readFile(join(frontend, "index.html"), "utf8");
  const manifest = JSON.parse(await readFile(join(frontend, "icons", "manifest.webmanifest"), "utf8"));
  const referenced = [...html.matchAll(/(?:href|src)="(\/icons\/[^"]+)"/g)].map((match) => match[1]);
  referenced.push(...manifest.icons.map((icon) => icon.src));
  assert.ok(referenced.length >= 5);
  for (const path of new Set(referenced)) {
    await readFile(join(frontend, path));
  }
});
