// Stands in for Africa's Talking in tests: requests to its API are answered
// by `respond` (a function of the sent form fields that returns a Response or
// throws); every other request, such as the tests' own calls to the app,
// goes through as normal. The real API is never called.
export function stubAfricasTalking(respond) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    if (!/africastalking\.com/.test(String(url))) return original(url, init);
    const fields = Object.fromEntries(new URLSearchParams(String(init.body)));
    calls.push({ url: String(url), headers: init.headers, fields });
    return respond(fields);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

export const atAnswer = recipients => new Response(
  JSON.stringify({ SMSMessageData: { Message: `Sent to ${recipients.length}/1`, Recipients: recipients } }),
  { status: 201, headers: { 'content-type': 'application/json' } }
);
