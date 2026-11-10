// SMS providers for one-time codes, chosen by OTP_PROVIDER:
//   console        — development only: prints the code in the server log
//                    (outside production; the number is always masked)
//   twilio         — TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
//   africastalking — AT_USERNAME, AT_API_KEY, AT_SENDER_ID (optional: unset
//                    or blank sends no `from`, so Africa's Talking uses its
//                    default route); AT_USERNAME=sandbox uses the sandbox endpoint
// Every provider implements sendOtp(phone, code) with an E.164 number (+2507…).
// Credentials live in the host's environment settings, never in the repo.

// Logs never carry a full phone number (ethics form): keep the country code
// and the last 3 digits, e.g. +250788123456 -> +250*****456.
export const maskPhone = phone => {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return `${digits.startsWith('250') ? '+250' : ''}*****${digits.slice(-3)}`;
};

// Masks any Rwandan mobile number inside free text, such as a provider's
// error message, before it is logged.
export const maskPhonesIn = text =>
  String(text ?? '').replace(/(?:\+?250|0)7\d{8}/g, maskPhone);

// The recipient's number could not be sent to (Africa's Talking answered, but
// not with a success status). The route turns it into a friendly message.
export class SmsRejectedError extends Error {}

// Africa's Talking per-recipient success codes: 100 Processed, 101 Sent,
// 102 Queued. Anything else (403 InvalidPhoneNumber, 405 InsufficientBalance,
// 406 UserInBlacklist, 409 DoNotDisturbRejection…) means no SMS.
const AT_SUCCESS = new Set([100, 101, 102]);

// Text from Africa's Talking, made safe to log: phone numbers masked, and the
// username and API key removed should they ever be echoed back.
const scrub = text => {
  let out = maskPhonesIn(text);
  for (const secret of [process.env.AT_API_KEY, process.env.AT_USERNAME]) {
    if (secret && secret.length >= 3) out = out.split(secret).join('[redacted]');
  }
  return out;
};

// One line per Africa's Talking send: when, the masked number, and what came
// back (status and statusCode, or the error). Never the code, full number,
// username or API key.
const logAtSend = (phone, outcome) =>
  console.log(`[sms] ${new Date().toISOString()} africastalking to ${maskPhone(phone)} ${scrub(outcome)}`);

const message = code => `Your Middleman code is ${code}. It expires in 5 minutes. Do not share it.`;

async function postForm(url, headers, fields) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...headers },
    body: new URLSearchParams(fields)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`SMS provider returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  return res.json().catch(() => ({}));
}

const requireEnv = names => {
  const missing = names.filter(n => !process.env[n]);
  if (missing.length) throw new Error(`Missing SMS settings: ${missing.join(', ')}`);
};

const PROVIDERS = {
  console: {
    async sendOtp(phone, code) {
      if (process.env.NODE_ENV === 'production') {
        console.log(`[otp] code for ${maskPhone(phone)} not logged in production; set an SMS provider`);
      } else {
        console.log(`[otp] code for ${maskPhone(phone)} is ${code}`);
      }
    }
  },

  twilio: {
    async sendOtp(phone, code) {
      requireEnv(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM']);
      const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = process.env;
      await postForm(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` },
        { To: phone, From: from, Body: message(code) }
      );
    }
  },

  africastalking: {
    async sendOtp(phone, code) {
      requireEnv(['AT_USERNAME', 'AT_API_KEY']);
      const { AT_USERNAME: username, AT_API_KEY: apiKey } = process.env;
      const from = process.env.AT_SENDER_ID?.trim();
      const host = username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
      let data;
      try {
        data = await postForm(
          `https://${host}/version1/messaging`,
          { apiKey },
          { username, to: phone, message: message(code), ...(from ? { from } : {}) }
        );
      } catch (err) {
        logAtSend(phone, `error="${err.message}"`);
        throw new Error(scrub(err.message)); // the route logs it too
      }
      // { SMSMessageData: { Message, Recipients: [{ number, status, statusCode, … }] } }
      const recipient = data?.SMSMessageData?.Recipients?.[0];
      if (!recipient) {
        const reason = `no recipient; message="${data?.SMSMessageData?.Message ?? ''}"`;
        logAtSend(phone, reason);
        throw new SmsRejectedError(scrub(reason));
      }
      const outcome = `status="${recipient.status}" statusCode=${recipient.statusCode}`;
      logAtSend(phone, outcome);
      if (!AT_SUCCESS.has(Number(recipient.statusCode))) throw new SmsRejectedError(scrub(outcome));
    }
  }
};

export function getOtpProvider() {
  const name = process.env.OTP_PROVIDER || 'console';
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown OTP_PROVIDER "${name}" (use console, twilio or africastalking)`);
  return provider;
}
