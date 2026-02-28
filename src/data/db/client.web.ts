/**
 * Web DB adapter — PERSISTENCE_DISABLED mode.
 *
 * Metro resolves this file instead of client.ts when bundling for web.
 * expo-sqlite is NOT imported here.
 *
 * Contract:
 *   - Read operations (select) → resolve to []
 *   - Write operations (insert, update, delete) → reject with explicit error
 *   - isPersistenceEnabled = false, exported for AppContext to surface to UI
 *   - A single startup warning is logged — no silent masking
 *
 * Repositories use getDb() with no platform knowledge.
 * The adapter layer is the only place platform behavior is defined.
 */

const PERSISTENCE_DISABLED_REASON =
  "PERSISTENCE_DISABLED: SQLite is not available in web preview mode. " +
  "Run on a native device via Expo Go to enable local persistence.";

const WRITE_ERROR_MESSAGE =
  "Persistence not supported in web preview mode";

let _warned = false;

// ─── Read chain ───────────────────────────────────────────────────────────────
// Every method call returns a new ReadChain.
// Awaiting a ReadChain resolves to [].

function createReadChain(): unknown {
  const handler: ProxyHandler<object> = {
    get(_target, prop: string | symbol) {
      if (prop === "then") {
        return (
          resolve: (value: unknown[]) => void,
          _reject?: (reason?: unknown) => void
        ) => {
          resolve([]);
        };
      }
      return (..._args: unknown[]) => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

// ─── Write chain ──────────────────────────────────────────────────────────────
// Every method call returns a new WriteChain.
// Awaiting a WriteChain rejects with WRITE_ERROR_MESSAGE.

function createWriteChain(): unknown {
  const handler: ProxyHandler<object> = {
    get(_target, prop: string | symbol) {
      if (prop === "then") {
        return (
          _resolve: (value: unknown) => void,
          reject: (reason: Error) => void
        ) => {
          reject(new Error(WRITE_ERROR_MESSAGE));
        };
      }
      return (..._args: unknown[]) => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

// ─── WebDbAdapter ─────────────────────────────────────────────────────────────

const webDbAdapter = {
  /** Reads: resolve to [] */
  select: () => createReadChain(),
  /** Writes: throw on await */
  insert: () => createWriteChain(),
  update: () => createWriteChain(),
  delete: () => createWriteChain(),
};

// ─── Exports (match client.ts signature exactly) ──────────────────────────────

/**
 * false on web — persistence is disabled.
 * AppContext surfaces this to the UI.
 */
export const isPersistenceEnabled = false;

export function initDatabase(): void {
  if (!_warned) {
    _warned = true;
    console.warn(
      `[FilaBro DB] ${PERSISTENCE_DISABLED_REASON}`
    );
  }
}

/**
 * Returns the WebDbAdapter.
 * Read methods resolve to [].
 * Write methods reject with "${WRITE_ERROR_MESSAGE}".
 * Cast to any — TypeScript uses client.ts for type checking via Metro resolution.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDb(): any {
  return webDbAdapter;
}
