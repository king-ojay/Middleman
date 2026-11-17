// Stable codes for the error messages the API sends ({ error: "<English>" }),
// so the app can show them in the person's language (client/src/i18n,
// keys "error.<code>"). Numbers in a message come back as `params`. The
// English text is unchanged and stays the fallback: a message not listed
// here simply gets no code. SMS text is not translated.
const CODES = [
  // signing up, logging in, codes and PINs
  [/^That phone number and PIN do not match$/, 'login_failed'],
  [/^Too many attempts\. Please wait 15 minutes and try again\.$/, 'login_locked'],
  [/^Too many attempts\. Please wait and try again\.$/, 'too_many_attempts'],
  [/^Enter a Rwandan mobile number, e\.g\. 0788 123 456$/, 'phone_invalid'],
  [/^Enter the full phone number, e\.g\. 0788 123 456$/, 'phone_incomplete'],
  [/^Too many codes requested\. Please wait a few minutes and try again\.$/, 'too_many_codes'],
  [/^An account with this phone number already exists\. Log in instead\.$/, 'account_exists'],
  [/^We couldn't send the code to that number, please check it and try again$/, 'code_rejected'],
  [/^We could not send the code\. Please try again\.$/, 'code_not_sent'],
  [/^Your PIN must be 4 digits$/, 'pin_invalid'],
  [/^That code has expired\. Ask for a new one\.$/, 'code_expired'],
  [/^Too many wrong codes\. Ask for a new one\.$/, 'code_too_many_wrong'],
  [/^That code is wrong\. (?<left>\d+) (try|tries) left\.$/, 'code_wrong'],
  [/^Choose client or worker$/, 'choose_role'],
  [/^Confirm that you are 18 or older to use Middleman$/, 'age_required'],
  [/^Read and agree to the Privacy Policy & Terms to create an account$/, 'policy_required'],
  [/^Enter your full name$/, 'name_required'],
  [/^Choose your area$/, 'area_required'],
  [/^Choose at least one trade$/, 'trade_required'],
  [/^You can't invite yourself\.$/, 'invite_self'],
  [/^We couldn't find that phone number\. Check it or skip this step\.$/, 'lookup_not_found'],
  [/^Too many lookups\. Please wait 15 minutes and try again\.$/, 'lookup_limited'],
  [/^Please log in again$/, 'login_again'],
  [/^Only clients can do this$/, 'clients_only'],
  [/^Only workers can do this$/, 'workers_only'],
  [/^Person not found$/, 'person_not_found'],
  // jobs, offers and ratings
  [/^Job not found$/, 'job_not_found'],
  [/^Job or response not found$/, 'response_not_found'],
  [/^Response not found for this job$/, 'response_not_found'],
  [/^This is not your job$/, 'not_your_job'],
  [/^A worker has already been chosen for this job$/, 'worker_already_chosen'],
  [/^This job is no longer taking responses$/, 'job_closed'],
  [/^This job is outside your trades$/, 'outside_trades'],
  [/^You have already responded to this job$/, 'already_responded'],
  [/^Price must be a whole number of RWF$/, 'price_invalid'],
  [/^The materials amount must be less than the price$/, 'materials_too_high'],
  [/^You have (?<limit>\d+) jobs in progress\. Finish one before taking another\.$/, 'at_limit'],
  [/^This worker is busy right now with (?<limit>\d+) jobs in progress\. Choose someone else, or try again later\.$/, 'worker_busy'],
  [/^You have already rated this worker for this job$/, 'already_rated_worker'],
  [/^You have already rated this client for this job$/, 'already_rated_client'],
  [/^You can rate the client once they have confirmed the job and the payment has been released to you$/, 'rate_client_too_early'],
  [/^This person has deleted their account, so they can no longer be rated$/, 'rated_person_deleted'],
  [/^Choose what the problem is$/, 'dispute_reason_required'],
  [/^Describe what is wrong in at least (?<min>\d+) characters$/, 'dispute_details_short'],
  [/^Keep the description to (?<max>\d+) characters or fewer$/, 'dispute_details_long'],
  // escrow
  [/^A payment for this job is already waiting for approval$/, 'payment_waiting'],
  [/^A payout for this job is already on its way$/, 'payout_on_its_way'],
  [/^This job is already paid into escrow$/, 'already_paid'],
  [/^The money for this job has already been released$/, 'already_released'],
  [/^The money for this job has already been refunded$/, 'already_refunded'],
  [/^The payment service didn't accept the payment\. Nothing was charged\. Please try again\.$/, 'payment_refused'],
  [/^The payment service didn't accept the payout\. The money is still held\. Please try again\.$/, 'payout_refused'],
  // anything else
  [/^Something went wrong\. Please try again\.$/, 'server_error'],
  [/^Not found$/, 'not_found']
];

/** Every code this table can give (the app has a translation for each). */
export const ERROR_CODES = [...new Set(CODES.map(([, code]) => code))];

/** { code, params? } for a known message, or null. */
export function errorCode(message) {
  if (typeof message !== 'string') return null;
  for (const [pattern, code] of CODES) {
    const match = pattern.exec(message);
    if (!match) continue;
    const params = match.groups && Object.fromEntries(Object.entries(match.groups).map(([k, v]) => [k, Number(v)]));
    return params ? { code, params } : { code };
  }
  return null;
}

// Express middleware: every JSON body with an `error` string gets its code
// (and params) added, wherever the route built it. Bodies that already carry
// a code, and unknown messages, pass through unchanged.
export function addErrorCodes(_req, res, next) {
  const json = res.json.bind(res);
  res.json = body => {
    if (body && typeof body.error === 'string' && !('code' in body)) {
      const found = errorCode(body.error);
      if (found) return json({ ...body, ...found });
    }
    return json(body);
  };
  next();
}
