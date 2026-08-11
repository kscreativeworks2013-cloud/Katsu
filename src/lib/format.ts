/**
 * Formatting helpers. Pure functions with no DOM or network access — the
 * cheapest layer to test, and the layer where edge cases belong.
 */

/** Builds the greeting shown in the app header. Untrimmed or empty names fall back to a generic greeting. */
export function formatGreeting(name: string): string {
  const trimmed = name.trim();
  return trimmed.length === 0 ? 'Hello there!' : `Hello, ${trimmed}!`;
}

/** Naive English pluralization, good enough for counters. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${Math.abs(count) === 1 ? singular : plural}`;
}
