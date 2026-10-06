// SMS providers for one-time codes, chosen by OTP_PROVIDER:
//   console        — development only: prints the code in the server log
//   twilio         — TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
//   africastalking — AT_USERNAME, AT_API_KEY, AT_SENDER_ID (optional);
//                    AT_USERNAME=sandbox uses the sandbox endpoint
// Every provider implements sendOtp(phone, code) with an E.164 number (+2507…).
// Credentials live in the host's environment settings, never in the repo.

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
      console.log(`[otp] code for ${phone} is ${code}`);
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
