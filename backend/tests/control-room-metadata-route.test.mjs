import assert from "node:assert/strict";
import test from "node:test";
import { createRequestHandler } from "../src/server.mjs";

async function invoke(handler, url, body) { let payload = ""; const response = { statusCode: 0, writeHead(status) { this.statusCode = status; }, end(value) { payload = value; } }; await handler({ method: "PATCH", url, headers: { host: "localhost", "content-type": "application/json" }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } }, response); return { status: response.statusCode, body: JSON.parse(payload) }; }

test("display-name PATCH maps stale metadata to an explicit conflict", async () => {
  const manager = { getRoom: (id) => id === "plant-1" ? { health: "READY" } : null, renameRoomDisplayName: async () => ({ status: "CONFLICT", displayName: "Plant One", revision: 2 }) };
  const result = await invoke(createRequestHandler(manager), "/api/control-rooms/plant-1/display-name", { displayName: "New", expectedRevision: 1 });
  assert.equal(result.status, 409); assert.equal(result.body.code, "ROOM_METADATA_CONFLICT"); assert.deepEqual(result.body.current, { displayName: "Plant One", revision: 2 });
});
