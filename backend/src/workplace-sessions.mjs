/** Authentication has no dependency on simulation, responder or analytics code. */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { workplaceIdentity } from './workplace-identity.mjs';
export const SESSION_COOKIE = 'compass_session';
export const SESSION_IDLE_MS = 12 * 3_600_000;
const WINDOW_MS = 10 * 60_000;
const refused = () => Object.assign(new Error('Login refused'), { statusCode: 401 });
export function createWorkplaceSessions({ manager, now = Date.now, logger = null } = {}) {
  const sessions = new Map(), failures = new Map();
  if (!process.env.COMPASS_WORKPLACE_PASSWORD) logger?.log?.(JSON.stringify({ event: 'workplace_password_unset', message: 'Workplace login disabled: COMPASS_WORKPLACE_PASSWORD is unset' }));
  const digest = value => createHash('sha256').update(value).digest();
  function token(request) {
    const match = String(request.headers.cookie ?? '').split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`));
    const value = match?.slice(SESSION_COOKIE.length + 1); return /^[A-Za-z0-9_-]{43}$/.test(value ?? '') ? value : null;
  }
  function cookie(request, value, clear = false) {
    const secure = request.socket?.encrypted || String(request.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https';
    return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}${clear ? '; Max-Age=0' : ''}`;
  }
  function prune() {
    for (const [id, entry] of sessions) if (now() - entry.lastSeenAt >= SESSION_IDLE_MS) sessions.delete(id);
    for (const [address, entry] of failures) if (now() >= (entry.blockedUntil ?? entry.startedAt + WINDOW_MS)) failures.delete(address);
  }
  return {
    async login(request, input) {
      prune(); const address = request.socket?.remoteAddress ?? 'unknown';
      const failure = failures.get(address);
      if (failure?.blockedUntil > now()) throw Object.assign(new Error('Too many login attempts; wait and try again'), { statusCode: 429 });
      const configured = process.env.COMPASS_WORKPLACE_PASSWORD;
      const validBody = input && Object.getPrototypeOf(input) === Object.prototype && Object.keys(input).length === 2 && Object.hasOwn(input, 'username') && Object.hasOwn(input, 'password');
      const supplied = validBody && typeof input.password === 'string' && input.password.length <= 4096 ? input.password : '';
      // Fixed-size digests permit timingSafeEqual regardless of supplied string length.
      const equal = timingSafeEqual(digest(configured || ''), digest(supplied));
      if (!configured || !validBody || !equal) {
        const entry = failure ?? { startedAt: now(), count: 0 }; entry.count++;
        if (entry.count >= 5) entry.blockedUntil = now() + WINDOW_MS;
        failures.set(address, entry); throw refused();
      }
      const identity = workplaceIdentity(input.username);
      const workplace = await manager.ensureWorkplace(identity.username);
      failures.delete(address);
      const id = randomBytes(32).toString('base64url'); sessions.set(id, { username: identity.username, roomId: workplace.roomId, createdAt: now(), lastSeenAt: now() });
      return { body: { username: identity.username, roomId: workplace.roomId }, cookie: cookie(request, id) };
    },
    async authenticate(request) {
      prune(); const id = token(request), session = sessions.get(id); if (!session) return null;
      if (!await manager.touchWorkplace(session.roomId)) { sessions.delete(id); return null; }
      session.lastSeenAt = now(); return { username: session.username, roomId: session.roomId };
    },
    logout(request) { sessions.delete(token(request)); return cookie(request, '', true); },
  };
}
