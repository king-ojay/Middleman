// FR-13: escrow is released to the worker this long after they mark the job
// done, unless the client confirms or reports a problem first
// (modules/payments/autoRelease.js).
export const AUTO_RELEASE_AFTER_MS = 72 * 60 * 60 * 1000;

// How often the running server looks for jobs that are due. It also looks
// when it starts and whenever a due job's page is opened by either party,
// because the free host sleeps and a timer alone would miss deadlines.
export const AUTO_RELEASE_CHECK_EVERY_MS = 15 * 60 * 1000;
