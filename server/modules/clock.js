// The current time for deadlines (auto-release, FR-13). Tests replace it with
// setNow so a 72-hour wait can be checked without waiting.
let nowFn = () => new Date();

export const now = () => nowFn();

/** Replaces the clock; setNow() with no argument restores the real one. */
export function setNow(fn) {
  nowFn = fn || (() => new Date());
}
