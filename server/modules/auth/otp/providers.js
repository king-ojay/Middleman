// SMS providers for one-time codes, chosen by OTP_PROVIDER:
//   console        — development only: prints the code in the server log
//                    (outside production; the number is always masked)
//   twilio         — TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
//   africastalking — AT_USERNAME, AT_API_KEY, AT_SENDER_ID (optional);
//                    AT_USERNAME=sandbox uses the sandbox endpoint
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
      const { AT_USERNAME: username, AT_API_KEY: apiKey, AT_SENDER_ID: from } = process.env;
      const host = username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
      await postForm(
        `https://${host}/version1/messaging`,
        { apiKey },
        { username, to: phone, message: message(code), ...(from ? { from } : {}) }
      );
    }
  }
};

export function getOtpProvider() {
  const name = process.env.OTP_PROVIDER || 'console';
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown OTP_PROVIDER "${name}" (use console, twilio or africastalking)`);
  return provider;
}
