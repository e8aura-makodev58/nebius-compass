import { createHash } from 'node:crypto';
export const WORKPLACE_RUN_MS = 3 * 60_000;
export const WORKPLACE_IDLE_MS = 7 * 86_400_000;
export const WORKPLACE_CAP = 200;
export function workplaceIdentity(input) {
  const username = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (!/^[a-z0-9-]{1,32}$/.test(username)) throw Object.assign(new Error('Use 1–32 letters, digits or hyphens for the username'), { statusCode: 400 });
  return { username, roomId: `workplace-${username}-${createHash('sha256').update(username).digest('hex').slice(0, 16)}` };
}
