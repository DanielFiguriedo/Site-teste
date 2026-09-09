/**
 * Detects a UNIQUE constraint violation coming from D1.
 *
 * The message has to be searched down the cause chain: Drizzle wraps the D1
 * error in a `DrizzleQueryError` whose own `message` is just
 * "Failed query: insert into ..." — the UNIQUE text sits in `cause`. Matching
 * only on the top-level message silently misses every duplicate.
 */
export function isUniqueViolation(e: unknown): boolean {
  for (let current: unknown = e, hops = 0; current && hops < 5; hops++) {
    const text = current instanceof Error ? current.message : String(current);
    if (/UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(text)) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}
