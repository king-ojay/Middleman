// FR-13: escrow is released to the worker this long after they mark the job
// done, unless the client confirms or reports a problem first
// (modules/payments/autoRelease.js).
export const AUTO_RELEASE_AFTER_MS = 72 * 60 * 60 * 1000;

// How often the running server looks for jobs that are due. It also looks
// when it starts and whenever a due job's page is opened by either party,
// because the free host sleeps and a timer alone would miss deadlines.
export const AUTO_RELEASE_CHECK_EVERY_MS = 15 * 60 * 1000;

// The client gets one SMS this long before an automatic release, so a
// problem can still be reported in time (modules/payments/releaseReminder.js).
export const RELEASE_REMINDER_BEFORE_MS = 24 * 60 * 60 * 1000;
