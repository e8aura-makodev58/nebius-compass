import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createWorkplaceSessions, SESSION_IDLE_MS } from '../src/workplace-sessions.mjs';
import { workplaceIdentity } from '../src/workplace-identity.mjs';
import { createRequestHandler, createCompassServer } from '../src/server.mjs';
import { Readable } from 'node:stream';
function environment(t) { const prior = process.env.COMPASS_WORKPLACE_PASSWORD; process.env.COMPASS_WORKPLACE_PASSWORD = randomBytes(32).toString('hex'); t.after(() => { if (prior === undefined) delete process.env.COMPASS_WORKPLACE_PASSWORD; else process.env.COMPASS_WORKPLACE_PASSWORD = prior; }); }
function manager() { const rooms = new Map(); let clones = 0; return { workplacesEnabled: true,
  ensureWorkplace: async username => { const identity = workplaceIdentity(username); if (!rooms.has(identity.roomId)) { clones++; rooms.set(identity.roomId, identity); } return identity; },
  touchWorkplace: async id => rooms.has(id), getRoom: id => rooms.has(id) ? { id, health: 'READY', applicationRuntime: { snapshot: () => ({ room: id }), enterCalibration: () => ({ decision: 'RECORDED' }) } } : null,
  listRoomsWithStatus: async id => [...rooms.values()].filter(row => row.roomId === id).map(row => ({ id: row.roomId })), clones: () => clones,
}; }
const req = (cookie, address = '127.0.0.1', https = false) => ({ headers: { ...(cookie ? { cookie } : {}), ...(https ? { 'x-forwarded-proto': 'https' } : {}) }, socket: { remoteAddress: address } });
const input = username => ({ username, password: process.env.COMPASS_WORKPLACE_PASSWORD });
async function http(handler, path, body, options = {}) {
  const stream = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  Object.assign(stream, { method: options.method ?? (body === undefined ? 'GET' : 'POST'), url: path, headers: { host: 'app.test', 'content-type': 'application/json', ...options.headers }, socket: { remoteAddress: options.address ?? '127.0.0.1' } });
  let status, value; const headers = {};
  await handler(stream, { setHeader(key, value) { headers[key.toLowerCase()] = value; }, writeHead(code) { status = code; this.statusCode = code; }, end(text) { try { value = JSON.parse(text); } catch { value = text; } } });
  return { status, body: value, headers };
}
test('environment-only password, uniform refusal, normalization, cookie flags, resume and no logged secret', async t => {
  environment(t); const m = manager(), logs = [], service = createWorkplaceSessions({ manager: m, logger: { log: line => logs.push(line) } });
  for (const username of ['known', 'unknown']) await assert.rejects(service.login(req(null, username), { username, password: randomBytes(32).toString('hex') }), { statusCode: 401, message: 'Login refused' });
  const first = await service.login(req(null, 'ok', true), input('  Visitor-A ')), second = await service.login(req(null, 'ok'), input('visitor-a'));
  assert.deepEqual(first.body, second.body); assert.equal(m.clones(), 1); assert.match(first.cookie, /HttpOnly/); assert.match(first.cookie, /SameSite=Strict/); assert.match(first.cookie, /; Secure/);
  assert.match(first.cookie, /^compass_session=[A-Za-z0-9_-]{43};/); assert.doesNotMatch(second.cookie, /Secure|Max-Age/);
  assert.equal(JSON.stringify(logs).includes(process.env.COMPASS_WORKPLACE_PASSWORD), false); assert.equal(JSON.stringify(first.body).includes(process.env.COMPASS_WORKPLACE_PASSWORD), false);
  await assert.rejects(service.login(req(null, 'bad-name'), input('../plant-1')), { statusCode: 400 });
});
test('missing/empty environment refuses every login and warns once per service without a value', async t => {
  environment(t); delete process.env.COMPASS_WORKPLACE_PASSWORD; const logs = [], service = createWorkplaceSessions({ manager: manager(), logger: { log: line => logs.push(line) } });
  for (let i = 0; i < 2; i++) await assert.rejects(service.login(req(null, `${i}`), { username: 'visitor', password: randomBytes(8).toString('hex') }), { statusCode: 401 });
  assert.equal(logs.length, 1); process.env.COMPASS_WORKPLACE_PASSWORD = '';
  await assert.rejects(service.login(req(null, 'empty'), input('visitor')), { statusCode: 401 });
});
test('idle expiry, cookie logout and failed login brake use injected time and address; success clears count', async t => {
  environment(t); let now = 0; const service = createWorkplaceSessions({ manager: manager(), now: () => now });
  const wrong = () => ({ username: 'visitor', password: randomBytes(8).toString('hex') });
  for (let i = 0; i < 4; i++) await assert.rejects(service.login(req(), wrong()), { statusCode: 401 });
  const first = await service.login(req(), input('visitor'));
  for (let i = 0; i < 5; i++) await assert.rejects(service.login(req(), wrong()), { statusCode: 401 });
  await assert.rejects(service.login(req(), input('visitor')), { statusCode: 429 });
  const other = await service.login(req(null, 'other'), input('other'));
  now += 10 * 60_000; await service.login(req(), input('visitor'));
  assert.ok(await service.authenticate(req(first.cookie)));
  const cleared = service.logout(req(first.cookie)); assert.match(cleared, /Max-Age=0/); assert.equal(await service.authenticate(req(first.cookie)), null);
  now += SESSION_IDLE_MS; assert.equal(await service.authenticate(req(other.cookie)), null);
});
test('HTTP guard: signed-out API 401, own-only list/writes, shared/model/global denial and logout', async t => {
  environment(t); const m = manager(), logs = [], sessions = createWorkplaceSessions({ manager: m }), handler = createRequestHandler(m, { log: line => logs.push(line) }, null, { sessionService: sessions });
  assert.equal((await http(handler, '/api/session')).status, 401);
  assert.equal((await http(handler, '/api/control-rooms')).status, 401);
  assert.equal((await http(handler, '/api/control-rooms/plant-1/state')).status, 401);
  const login = await http(handler, '/api/session/login', input('judge')); assert.equal(login.status, 200);
  const cookie = login.headers['set-cookie'], headers = { cookie }, room = login.body.roomId;
  assert.deepEqual((await http(handler, '/api/session', undefined, { headers })).body, { username: 'judge', roomId: room });
  assert.deepEqual((await http(handler, '/api/control-rooms', undefined, { headers })).body.rooms, [{ id: room }]);
  assert.equal((await http(handler, `/api/control-rooms/${room}/state`, undefined, { headers })).status, 200);
  assert.equal((await http(handler, `/api/control-rooms/${room}/calibrations`, {}, { headers })).status, 200);
  for (const path of ['/api/control-rooms/plant-1/reset', '/api/control-rooms/template/reset', '/api/control-rooms/other/reset', `/api/control-rooms/${room}/ask`, `/api/control-rooms/${room}/compass`, `/api/control-rooms/${room}/simulation/start`, '/api/settings/models', '/api/logs/client']) assert.equal((await http(handler, path, {}, { headers })).status, 403, path);
  assert.notEqual((await http(handler, `/api/control-rooms/${room}/reports`, {}, { headers })).status, 403);
  assert.notEqual((await http(handler, `/api/control-rooms/${room}/investigations/none/approve`, {}, { headers })).status, 403);
  assert.equal((await http(handler, '/api/session/login', input('judge'), { headers: { origin: 'https://other.test' } })).status, 403);
  const logout = await http(handler, '/api/session/logout', {}, { headers }); assert.equal(logout.status, 200); assert.match(logout.headers['set-cookie'], /Max-Age=0/);
  assert.equal((await http(handler, '/api/session', undefined, { headers })).status, 401);
  assert.equal(JSON.stringify(logs).includes(process.env.COMPASS_WORKPLACE_PASSWORD), false);
});
test('auth source imports only crypto and safe identity policy, never model/simulation code', async () => {
  const source = await readFile(new URL('../src/workplace-sessions.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(x => x[1]), ['node:crypto', './workplace-identity.mjs']);
  assert.match(source, /timingSafeEqual/); assert.match(source, /randomBytes\(32\)/);
});


test('network server factory requires sessions even for a manager without workplace fixtures enabled', async t => {
  environment(t); const m = manager(); m.workplacesEnabled = false;
  const server = createCompassServer(m, null), handler = server.listeners('request')[0];
  assert.equal((await http(handler, '/api/control-rooms')).status, 401);
  assert.equal((await http(handler, '/api/control-rooms/plant-1/state')).status, 401);
});
