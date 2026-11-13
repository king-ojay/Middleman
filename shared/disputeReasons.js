// The reasons a person picks from when they report a problem on a job: the
// one list for the server (validation) and the app (the Report a problem
// sheet, the job page and /admin). Edit here, then run `npm run sync:shared`.
// No imports, so Node and Vite can both load it.
export const DISPUTE_REASONS = Object.freeze({
  client: Object.freeze([
    { value: 'not_done', label: 'Work not done' },
    { value: 'poor_quality', label: 'Work not finished or poor quality' },
    { value: 'no_show', label: 'Worker did not show up' },
    { value: 'other', label: 'Other' }
  ]),
  worker: Object.freeze([
    { value: 'not_confirming', label: 'Client will not confirm finished work' },
    { value: 'job_changed', label: 'Client changed the job' },
    { value: 'unreachable', label: 'Client unreachable' },
    { value: 'other', label: 'Other' }
  ])
});

// The description that goes with it, in characters after cleaning.
export const DISPUTE_DETAILS_MIN = 20;
export const DISPUTE_DETAILS_MAX = 500;

/** "Work not done", or null for a reason this role can't give. */
export const disputeReasonLabel = (role, value) => DISPUTE_REASONS[role]?.find(r => r.value === value)?.label ?? null;

/**
 * The description as plain text: no markup, no control or direction-changing
 * characters, single spaces, at most one blank line in a row, trimmed. The
 * app counts characters with this too, so its counter matches the server.
 */
export function cleanDisputeDetails(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, '')
    .split('\n').map(line => line.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
