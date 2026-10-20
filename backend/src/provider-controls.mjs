/**
 * Runtime controls for AMD Token Factory calls: a local rate/concurrency
 * limiter with a bounded wait queue, 429 retries that honour Retry-After, and a
 * circuit breaker.
 *
 * Every control respects the caller's deadline. A request that cannot start,
 * or cannot retry, before its deadline fails at once so the caller falls back
 * to its deterministic path. Only service failures (429, 5xx, network errors,
 * timeouts) move the breaker; the callers' validation rejections never reach
 * this module.
 */

const WINDOW_MS = 60_000;
const DEFAULT_MAX_QUEUE = 32;
const BACKOFF_BASE_MS = 1_000;

const DEFAULTS = Object.freeze({
  rpm: 10,
  concurrency: 2,
  maxRetries: 2,
  breakerThreshold: 5,
  breakerCooldownMs: 60_000,
  maxQueue: DEFAULT_MAX_QUEUE,
});

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Application budgets from the environment; AMD's own limits are higher. */
export function readProviderControlSettings(environment = process.env, provider = "amd") {
  const prefix = provider === "nebius" ? "NEBIUS_TOKEN_FACTORY" : "AMD_TOKEN_FACTORY";
  return {
    rpm: positiveInt(environment[`${prefix}_APP_RPM`], provider === "nebius" ? 20 : DEFAULTS.rpm),
    concurrency: positiveInt(environment[`${prefix}_APP_CONCURRENCY`], DEFAULTS.concurrency),
    maxRetries: nonNegativeInt(environment[`${prefix}_MAX_RETRIES`], DEFAULTS.maxRetries),
    breakerThreshold: positiveInt(environment[`${prefix}_BREAKER_THRESHOLD`], DEFAULTS.breakerThreshold),
    breakerCooldownMs: positiveInt(environment[`${prefix}_BREAKER_COOLDOWN_MS`], DEFAULTS.breakerCooldownMs),
    maxQueue: DEFAULTS.maxQueue,
  };
}

/** Retry-After is either delta-seconds or an HTTP date. Returns ms or null. */
export function parseRetryAfter(value, nowEpochMs = Date.now()) {
  if (value == null) return null;
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 1000);
  const date = Date.parse(text);
  return Number.isNaN(date) ? null : Math.max(0, date - nowEpochMs);
}

export class ProviderControlError extends Error {
  constructor(message, code, { timeout = false } = {}) {
    super(message);
    this.code = code;
    // Callers report AbortError as a timeout; a request that could not start
    // before its deadline is exactly that.
    this.name = timeout ? "AbortError" : "ProviderControlError";
  }
}

export function createProviderControls(settings = {}, {
  now = () => performance.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  random = Math.random,
} = {}) {
  const config = { ...DEFAULTS, ...settings };

  // --- Limiter: concurrency slots plus a sliding one-minute start window.
  let active = 0;
  const starts = [];
  const waiters = [];
  let wakeTimer = null;

  function tryStart() {
    const current = now();
    while (starts.length && current - starts[0] >= WINDOW_MS) starts.shift();
    if (active >= config.concurrency || starts.length >= config.rpm) return false;
    active += 1;
    starts.push(current);
    return true;
  }

  function releaser() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active -= 1;
      pump();
    };
  }

  function pump() {
    while (waiters.length && tryStart()) {
      const waiter = waiters.shift();
      clearTimer(waiter.timer);
      waiter.resolve(releaser());
    }
    if (waiters.length && active < config.concurrency && !wakeTimer) {
      // Blocked by the rate window, not by slots: wake when the oldest start expires.
      wakeTimer = setTimer(() => { wakeTimer = null; pump(); }, Math.max(1, starts[0] + WINDOW_MS - now()));
    }
  }

  function acquire(deadline) {
    if (!waiters.length && tryStart()) return Promise.resolve(releaser());
    if (waiters.length >= config.maxQueue) {
      return Promise.reject(new ProviderControlError("AMD request queue is full", "queue-full"));
    }
    const remaining = deadline - now();
    if (remaining <= 0) {
      return Promise.reject(new ProviderControlError("AMD request could not start before its deadline", "deadline", { timeout: true }));
    }
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      waiter.timer = setTimer(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(new ProviderControlError("AMD request could not start before its deadline", "deadline", { timeout: true }));
      }, remaining);
      waiters.push(waiter);
      pump();
    });
  }

  // --- Circuit breaker: closed → open after N consecutive service failures →
  // half-open (one probe) after the cooldown → closed on success.
  let state = "closed";
  let consecutiveFailures = 0;
  let openedAt = 0;
  let probeInFlight = false;

  function admit() {
    if (state === "open") {
      if (now() - openedAt < config.breakerCooldownMs) {
        throw new ProviderControlError("AMD circuit breaker is open after repeated service failures", "circuit-open");
      }
      state = "half-open";
      probeInFlight = false;
    }
    if (state === "half-open") {
      if (probeInFlight) throw new ProviderControlError("AMD circuit breaker is half-open; a probe request is in flight", "circuit-open");
      probeInFlight = true;
    }
  }

  function recordServiceReached() {
    state = "closed";
    consecutiveFailures = 0;
    probeInFlight = false;
  }

  function recordServiceFailure() {
    consecutiveFailures += 1;
    if (state === "half-open" || consecutiveFailures >= config.breakerThreshold) {
      state = "open";
      openedAt = now();
    }
    probeInFlight = false;
  }

  function abandonProbe() {
    // The admitted request never reached AMD (queue full or deadline), so the
    // next request may probe instead.
    if (state === "half-open") probeInFlight = false;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimer(resolve, ms));
  }

  function backoffMs(retry) {
    return Math.round(BACKOFF_BASE_MS * 2 ** retry * (0.5 + random() * 0.5));
  }

  /**
   * Runs attempt(deadline) under the controls. attempt must throw errors that
   * carry `serviceFailure` (boolean), and `status` / `retryAfterMs` for HTTP
   * failures. Only HTTP 429 is retried, per the AMD guide.
   */
  async function run(deadline, attempt) {
    for (let retry = 0; ; retry += 1) {
      admit();
      let release;
      try {
        release = await acquire(deadline);
      } catch (error) {
        abandonProbe();
        throw error;
      }
      let failure;
      try {
        const value = await attempt(deadline);
        recordServiceReached();
        return value;
      } catch (error) {
        if (error?.serviceFailure) recordServiceFailure();
        else recordServiceReached();
        failure = error;
      } finally {
        release();
      }
      const wait = failure.status === 429 ? (failure.retryAfterMs ?? backoffMs(retry)) : null;
      if (wait == null || retry >= config.maxRetries || state !== "closed" || now() + wait >= deadline) throw failure;
      await sleep(wait);
    }
  }

  function snapshot() {
    return { state, consecutiveFailures, active, queued: waiters.length, startsInWindow: starts.length };
  }

  return { run, acquire, snapshot, config };
}

// One set of controls per transport. The real `fetch` therefore shares a
// single limiter and breaker across every caller and control room in the
// process, while each injected test transport gets its own isolated set.
const controlsByTransport = new WeakMap();

export function providerControlsFor(fetchImpl, environment = process.env, provider = "amd") {
  let byProvider = controlsByTransport.get(fetchImpl);
  if (!byProvider) { byProvider = new Map(); controlsByTransport.set(fetchImpl, byProvider); }
  if (!byProvider.has(provider)) byProvider.set(provider, createProviderControls(readProviderControlSettings(environment, provider)));
  return byProvider.get(provider);
}
