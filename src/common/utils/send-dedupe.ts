/**
 * Idempotency for chat sends. Clients keep unsent messages in an offline
 * outbox and re-emit them until the server acknowledges; when the ack (not the
 * message) was lost, the retry must not create a second row. Each send carries
 * a client-generated id — a repeat from the same sender returns the first
 * result (or joins it while it is still being saved) instead of running again.
 *
 * In-memory on purpose: single Render instance, short window, no migration.
 * A restart between "saved" and "retried" can still duplicate once.
 */
const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 5000;

const store = new Map<string, { at: number; result: Promise<unknown> }>();

function prune(now: number) {
  for (const [key, entry] of store) {
    if (now - entry.at > TTL_MS) store.delete(key);
    else break; // insertion-ordered → the rest are newer
  }
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function dedupeSend<T>(
  senderId: string,
  clientId: unknown,
  run: () => Promise<T>,
): Promise<T> {
  if (typeof clientId !== 'string' || !clientId || clientId.length > 100) {
    return run();
  }
  const now = Date.now();
  const key = `${senderId}:${clientId}`;
  const hit = store.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.result as Promise<T>;

  prune(now);
  const result = run();
  store.set(key, { at: now, result });
  result.then(
    (value) => {
      // A refusal ({ error }) wasn't saved — let a retry try again.
      if (value && typeof value === 'object' && 'error' in value) {
        store.delete(key);
      }
    },
    () => store.delete(key),
  );
  return result;
}
