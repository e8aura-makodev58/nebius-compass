# Shared-password login with per-username workplaces

Status: **approved by user 2026-10-25 for build.** Rounds 45 (codex, backend) and 46 (gemini, frontend).
Synthetic, domain-neutral data only. Purpose: give public visitors (for example judges) their own
workplace for a demo, without giving them any write access to shared state.

## 1. Behaviour

- A visitor opens the app and sees a login form with two fields: **username** and **password**.
- Any non-empty username is accepted. The password must equal the server secret. A wrong password is
  rejected with the same message for every case (no username enumeration).
- On success the server sets a session cookie. The same username with the same password, on any later
  visit, resumes **that username's workplace**.
- A **new** username gets a new workplace, cloned from the **bootstrap template** room. The clone happens
  once, on first successful login for that username.
- A new workplace starts its simulation run **once**, on creation, for a fixed 3 minutes. Resuming an
  existing workplace never starts a run. Run length is a server constant, not a request field.
- There is no guest access. Without a valid session, every route except the login page and its own
  assets returns 401, and the app shows the login form.

## 2. Secret and configuration

- The password is read from the environment variable `COMPASS_WORKPLACE_PASSWORD`. Its **value must never
  be committed** to git, to docs, to fixtures, or to test files. Tests set their own value through the
  environment for the process they start.
- If the variable is unset or empty, login is **refused for every request** (fail closed). The server logs a
  single startup warning, without the value.
- The name of the variable may appear in code and docs. Its value may not.
- Comparison uses a constant-time function (`crypto.timingSafeEqual` on equal-length buffers).

## 3. Sessions and cookies

- Session id: 32 random bytes from `crypto.randomBytes`, encoded base64url. Stored server-side mapped to
  `{ username, createdAt, lastSeenAt }`.
- Cookie: `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` when the request came over HTTPS. No
  `Max-Age` is needed for a demo; the session lifetime is set below.
- Session lifetime: idle expiry after **12 hours** of no use, and the server drops sessions past that.
- Logout (`POST /api/session/logout`) deletes the session and expires the cookie.

## 4. Failed-login limit

- Track failed logins per client address in memory: after **5 failures in 10 minutes**, refuse further
  login attempts from that address for 10 minutes with `429`. A successful login clears the count.
- This is a brake on guessing, not a security boundary, and it resets on server restart. It is
  acceptable for a demo; say so in the spec's open items when shipping.

## 5. Per-username workplaces

- Workplace id is derived deterministically from the username: lower-case, trimmed, limited to
  `[a-z0-9-]{1,32}`; anything else is rejected at login with a plain validation message. A readable
  prefix plus a short hash of the normalised username keeps ids unique and file-safe.
- Clone: copy the **template room's seed state** into the new room. The template holds the bootstrap
  rows (ATE-1 and ATE-2 calibrations, the three loadboards, no reservations, no runs, no alarms).
  Live `plant-1` data is never copied.
- Creation goes through the existing control-room manager (`backend/src/control-room-manager.mjs`) so
  the room is created the same way as any other room. Codex must read it first and reuse it.
- Demo workplaces are **hidden from the public room list**. A logged-in user sees only their own
  workplace. `GET /api/control-rooms` for a demo session returns only that session's room.

## 6. Write scope

- Under a demo session, writes are allowed **only** to that session's own workplace.
- Writes to the template, to `plant-1`, or to any other room return `403`.
- Model-backed routes (`/ask`, report generation, and anything that calls a provider) return `403` for
  demo sessions. This keeps spend predictable.
- The existing room-mutation origin/JSON checks still apply to every write.

## 7. Cleanup and limits

- Workplaces idle for **7 days** are deleted by a scheduled sweep. The sweep runs at server start and
  then at most once an hour. Deleting a workplace removes its room state files, and nothing else.
- Hard cap: **200** demo workplaces. Creating a new one at the cap returns `503` with a plain message;
  existing workplaces keep working.
- The template and `plant-1` are never swept.

## 8. Routes (proposed)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/session/login` | Body `{ username, password }`. Returns the workplace room id on success. |
| `POST` | `/api/session/logout` | Ends the session. |
| `GET` | `/api/session` | Returns `{ username, roomId }` or `401`. |

Existing room routes stay as they are, except that every request under `/api/control-rooms/` now needs a
valid session (or the existing unauthenticated static assets, which stay public).

## 9. Acceptance

Hermetic tests (`npm test`, no network, no writes to `backend/data/`):
- Wrong password → `401` with the same body as an unknown user; correct password with any username → `200`.
- Unset `COMPASS_WORKPLACE_PASSWORD` → every login refused.
- Same username and password on a second login → the same room id; no second clone, no second run.
- New username → new room cloned from the template; `plant-1` unchanged.
- Five failures from one address → `429` until the window passes; success resets the count.
- Demo session `POST` to another room, to the template, or to `/ask` → `403`.
- Cookie has `HttpOnly` and `SameSite=Strict`; logout invalidates it.
- Sweep deletes an idle workplace and leaves the template and `plant-1` untouched; the cap returns `503`.
- The module imports nothing from `simulation`, `responder` or `analytics` for the auth path, and the
  password value appears in no log line or response body.

E2E (`npm run test:e2e`, forced failures, no API spend):
- Login form shown when signed out; wrong password shows the error; correct password opens the app.
- Two usernames see different workplaces; returning user keeps their state.
- Logout returns to the login form.
- No outbound requests (existing zero-outbound assertion still passes).

## 10. Open items

- **Shared password, open usernames.** Anyone with the password can open any username's workplace by
  typing its name. This is accepted for the judging demo. Revisit before any real-use deployment.
- **Failed-login limit is in memory.** It resets on restart and does not survive a second server process.
- **Run length (3 minutes) and idle expiry (7 days, 12 hours)** are constants chosen for the demo; confirm
  with the user before judging.
- **Deploy.** Setting the variable on `e8aura-deploy` and redeploying happens only after the user's
  go-ahead, and the secret is written to the server's environment file, never to git.
