# Test matrix: browsers and devices

How Middleman was tested across browsers, phones and screen sizes. The
automated rows come from the Playwright end-to-end flow
([`e2e/fullFlow.spec.js`](../e2e/fullFlow.spec.js)), run on each project in
[`e2e/playwright.config.js`](../e2e/playwright.config.js) against a local API,
a throwaway local database, the console one-time-code provider and the fake
payment provider (no SMS, no money). The manual rows are checks on real
devices and installed browsers against the live app.

## Automated: the whole flow on five browsers and devices

Run on 17 November 2026, on `main` at 741fad5 (with the job limit), with Playwright 1.56.1 on macOS 26.1 (Apple silicon):

```bash
cd e2e
E2E_MONGO_URI='mongodb://127.0.0.1:27099/middleman_e2e?directConnection=true' npm test
```

`npm test` runs `runAll.sh`: each project gets its own fresh API and database,
then the results are merged into one HTML report (`e2e/playwright-report/`,
not committed).

Each run covers: register a client and a worker the client invited (one-time
code, PIN, inviter lookup), post a job, the worker's offer, the offer ranked by
trust with its reason sentence, choose and pay into escrow, the call button
for both parties, start and finish the work, the automatic-release deadline
for both parties, confirm and rate, the worker rates the client, the worker's
earnings and Transactions page, and the client's Discover sentence built from
the real rating.

| Project | Browser engine and version | Viewport (CSS px), scale | Touch | Result | Time |
|---|---|---|---|---|---|
| Desktop Chromium | Google Chrome 157.0.8103.51 | 1280 × 720, 1× | No | Pass | 5.2 s |
| Desktop Firefox | Firefox 142.0.1 (Playwright build) | 1280 × 720, 1× | No | Pass | 7.2 s |
| Desktop WebKit | WebKit 26.0 (Safari engine, Playwright build) | 1280 × 720, 2× | No | Pass | 6.5 s |
| Pixel 7 (emulated) | Google Chrome 157.0.8103.51, Android user agent | 412 × 839, 2.625× | Yes | Pass | 5.5 s |
| iPhone 14 (emulated) | WebKit 26.0, iOS Safari user agent | 390 × 664, 3× | Yes | Pass | 6.8 s |

5 of 5 passed, no retries, no flaky runs. The phone rows are emulation
(screen size, touch, user agent) in the desktop engines, not real phones;
the manual rows below cover real devices.

## Manual: real devices and installed browsers

To fill in after testing the live app (https://middleman-client.vercel.app).
For each device or browser, record the result of every check: **Pass**,
**Fail** (with what went wrong) or **Not tested**.

Checks:

1. **Load:** the app opens, the "Sandbox – no real money" banner shows.
2. **Sign up or log in:** a new account with the SMS code, or a demo account (PIN `1234`).
3. **Discover:** pick a trade; workers ranked with a tier and the reason sentence.
4. **Post a job:** trade, description, price.
5. **Offers:** offers ranked by trust; choose one.
6. **Pay into escrow:** sandbox payment, status changes to held.
7. **Call button:** "Call <name>" on an active job opens the phone's dialler (on a laptop: offers an app to call with, or does nothing).
8. **Transactions:** totals, the three tiles, the job cards.
9. **Layout at that size:** no text cut off, nothing wider than the screen, buttons easy to tap.

| Device or browser | OS and version | How tested | Load | Sign up or log in | Discover with reason | Post a job | Offers | Pay into escrow | Call button | Transactions | Layout | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Android phone (model: ) | Android | Real device, Chrome | | | | | | | | | | |
| iPhone (model: ) | iOS | Real device, Safari | | | | | | | | | | |
| Chrome (version: ) | macOS | Laptop | | | | | | | | | | |
| Firefox (version: ) | macOS | Laptop | | | | | | | | | | |
| Safari (version: ) | macOS | Laptop | | | | | | | | | | |
| Edge (version: ) | macOS | Laptop | | | | | | | | | | |
