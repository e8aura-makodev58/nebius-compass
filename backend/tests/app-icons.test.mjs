import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createRequestHandler } from "../src/server.mjs";

const frontend = fileURLToPath(new URL("../../frontend/", import.meta.url));
const ICON = "/icons/Compass_application_logo_icon.ico";
const LOGO = "/icons/Compass_application_logo_icon_20261025201828.jpg";

async function responseFor(url) {
  const capture = { body: Buffer.alloc(0) };
  const response = { writeHead(status, headers) { capture.status = status; capture.headers = headers; }, end(chunk) { capture.body = Buffer.from(chunk ?? ""); } };
  await createRequestHandler(null)({ method: "GET", url, headers: { host: "localhost" }, async *[Symbol.asyncIterator]() {} }, response);
  return capture;
}

test("the supplied favicon and logo are served with their own media types", async () => {
  for (const [url, type] of [[ICON, "image/x-icon"], [LOGO, "image/jpeg"]]) {
    const { status, headers } = await responseFor(url);
    assert.equal(status, 200, url);
    assert.equal(headers["content-type"], type, url);
  }
});

test("the page requests the favicon, and the picker shows the logo", async () => {
  const html = await readFile(join(frontend, "index.html"), "utf8");
  assert.match(html, new RegExp(`<link rel="icon" href="${ICON.replaceAll(".", "\\.")}"`));
  assert.ok(html.includes(`src="${LOGO}"`));
});

test("every icon and logo the page references exists in the frontend folder", async () => {
  const html = await readFile(join(frontend, "index.html"), "utf8");
  for (const path of new Set([...html.matchAll(/(?:href|src)="(\/icons\/[^"]+)"/g)].map((match) => match[1]))) {
    await readFile(join(frontend, path));
  }
});
