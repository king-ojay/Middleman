# Desktop and tablet glitch pass (2026-11-02)

Layout and styling only: no behaviour, copy, trust or escrow logic changed.

## How it was tested

- **Build and data:** a production build (`vite build`, `NODE_ENV=production` API) on a seeded one-node replica set. The MoMo sandbox provider ran against the test stub, which is how the waiting and failed payment states were produced.
- **Stress data:** extra local test accounts with a 47-character name, a 9,999,999 RWF counter-offer and empty accounts.
- **Coverage:** 59 page states for both roles. These include signed-out pages, Discover, profiles, post job, every My jobs and My work tab with its empty state, the worker feed with filters and both offer sheets, and the job page in 19 states. They also cover the profile area edit, a job-not-found error, offline (API unreachable) and the server-waking notice.
- **Widths, themes, browsers:**
  - Chromium: 1920, 1440, 1280, 1024, 768 and 360 px, light and dark, giving 708 page-states before and 708 after the fixes.
  - Firefox 130 and WebKit 18: 1920, 1280, 768 and 360 px in light, and 1280 and 360 px in dark (354 page-states each).

**Automated checks on every page-state:**
- horizontal scroll and elements off-screen;
- clipped text and overlapping text;
- tap targets: 44 px under 768 px, 24 px from 768 px;
- over-long lines;
- the sticky top bar after scrolling;
- numeric trust scores in the page text;
- console errors and failed requests;
- axe-core (colour contrast, names and labels, nested controls) at 1440, 768 and 360 px.

**Separate checks:**
- keyboard focus rings: Tab through 11 pages, light and dark;
- hover styles on every control at 1280 px;
- whether the last content clears the phone tab bar.

## Found, fixed and left

| # | Glitch | Where | Widths | Status |
|---|---|---|---|---|
| 1 | Cards in a row had different heights, leaving holes in the grid and buttons at different heights | Discover, My jobs, My work, worker feed, offers, recent ratings | 768–1920 | **Fixed** (Card grid layout): cards stretch to the row height, and price and action sit at the bottom |
| 2 | "Your price" label sat under the description, away from the amount it labels | Client job page, open job with offers | all | **Fixed** (Card grid layout): label shown above the amount |
| 3 | "Verified" used the same solid green as "Trusted in your network" and read as one badge | Discover, offers, profiles | all | **Fixed** (Badge and contrast fixes): outlined pill with a check |
| 4 | Grey "new" avatars had white initials at 2.44:1 contrast (axe: color-contrast) | Discover, feed, offers, profiles | all, light mode | **Fixed** (Badge and contrast fixes): light grey with muted initials, about 5:1 |
| 5 | Switch off-track nearly invisible on a white card; 30 px tall tap target on phones | Confirm & rate, offer sheets | all; 360 | **Fixed** (Badge and contrast fixes): 1 px muted outline; 44 px hit area, checked by tapping 5 px above the track |
| 6 | No hover feedback on 99 controls (buttons, chips, tabs, area and role pickers, cards, back, logo, text links) | every page | 768–1920 | **Fixed** (Hover states): hover and pressed states, on pointer devices only (`hoverOnlyWhenSupported`) |
| 7 | `Card className="p-0"` was ignored (`p-4` won in the stylesheet), leaving a 16 px dead border that could not be clicked or tapped | Discover cards, Register "Who invited you?" list | all, including 360 | **Fixed** (Card padding fix) |
| 8 | Offer sheet has no visible close button on desktop (Escape or a click outside closes it) | Worker feed: Accept and Counter sheets | 768–1920 | **Fixed** later (Close button and Try again): a "Close" button, 44 px tall, reachable by keyboard; focus goes back to the card button that opened the sheet |
| 9 | Offline and server errors show a message but no "Try again" button | Discover, My jobs, job page | all | **Fixed** later (Close button and Try again): "Try again" re-runs the same request when the API is unreachable or answers 5xx (not on 4xx such as "Job not found"); it shows "Trying again…" while it runs |
| 10 | Job-title and person-name links are about 22 px tall | My jobs cards, feed and offers names | all | **Left**: passes WCAG 2.5.8 through the spacing and equivalent-control exceptions (each card has a full-size button) |
| 11 | My jobs status tabs wrap to a second line | My jobs | 768 | **Left**: acceptable; scrolling them sideways instead would change behaviour |
| 12 | Sandbox banner scrolls away on desktop while the top bar stays | all signed-in pages | 768–1920 | **Left**: design decision (making it sticky takes 28 px of every screen) |

**Checked with no problem found:**
- no horizontal scroll at any width;
- no off-screen, clipped or overlapping content;
- no numeric scores;
- the top bar stays at the top when scrolling;
- phone content clears the tab bar;
- focus rings on every tab stop in light and dark;
- no unexpected console errors or failed requests (only the expected 401/429/404 and the simulated offline requests);
- sheets are centred at 520 px or less on desktop;
- the long name and the 9,999,999 RWF amount wrap without overflow.

The 360 px phone layout changed only where a fix improves it:
- the card padding (#7) gives names more room and makes the whole card tappable;
- the avatar, badge and switch fixes apply at every width.

## Screenshots

Each pair is `<page>-<width>-<theme>-before.png` / `-after.png`. The pages are Discover (1280 light, 360 light, 1440 dark), My jobs Active tab (1280), worker feed (1920), job offers (1280), confirm & rate (1280) and long-name worker profile (1440). Hover states don't show in still screenshots; a separate hover check found 99 controls without hover feedback before and 16 after. Those 16 are current tabs, selected chips and selected options, which stay as they are on purpose.
