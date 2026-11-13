// The only text a payment provider ever gets from us. Nothing a person typed
// (job descriptions, names) is sent: notes are built from the job id, and
// whatever reaches a provider is cut down to letters, digits and single
// spaces, because the MoMo sandbox's firewall answers anything it dislikes
// with an HTML "Request Rejected" page.

export const NOTE_MAX = 60;
const ID_MAX = 50;

/** Letters, digits and single spaces, at most 60 characters ("é" becomes "e"). */
export function safeNote(text) {
  const clean = String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // the accents NFKD split off
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .slice(0, NOTE_MAX)
    .trim();
  return clean || 'Middleman job';
}

/** Letters and digits only. */
export const safeExternalId = id => String(id ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, ID_MAX) || 'middleman';

/** "Middleman job 4f9a2c fund": the last 6 characters of the job id and the movement. */
export const jobNote = (jobId, kind) => safeNote(`Middleman job ${String(jobId).slice(-6)} ${kind}`);
