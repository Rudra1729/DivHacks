# WebPass NYC — Spider-Man Theme & Animated Frontend Overview

This folder contains the complete UI architecture, animation guide, and Spider-Man comic book design system for **WebPass NYC**.

For complete component specifications, animation triggers, Spidey-Bot expressions, and API mappings, see [APP_SPECIFICATION.md](file:///c:/Users/user/Documents/divhacks26/frontend/APP_SPECIFICATION.md).

---

## Spider-Man Theme & Visual Aesthetic

* **Comic Art Design:** Bold halftone dot background textures, radial action burst rays, torn paper collage banners, and comic sound callouts (*THWIP! POW! BOOM! GUARDRAIL HELD!*).
* **Color System:** Hero Red (`#E52421`), Web Blue (`#0055A5`), Ink Black (`#121212`), Off-White Paper (`#F7F4EB`), Accent Yellow (`#FFCC00`).
* **Spidey-Bot (Grok AI Referee):** Animated Spider-Man mask avatar with dynamic eye lenses that react to verification gates in real-time (narrowing on evaluation, glowing white on approval, flashing red on sentinel/policy blocks).

---

## Key Moving Animations

1. **"THWIP!" Web Shooter Engine:** Animated web thread bezier lines zip across the NYC map graph when a mission is verified, exploding into a web splash and lighting up neighborhood nodes.
2. **Radial Halftone Burst Rays:** Rotating background action rays providing parallax depth on scroll.
3. **3D Holographic Card Flip:** Collectible trading cards with tilt perspective and holographic foil sheen.
4. **5-Gate Security Pipeline Beam:** Pulsing energy beam traveling through Sentinel → Grok Spidey → Policy Engine → XRPL → Solana.

---

## Required Tabs Summary

| Tab / View Name | Primary Function | Marvel / Spidey Comic Theme Features |
| :--- | :--- | :--- |
| **Landing Page** | Product hero & story introduction | "SUIT UP HEROES!" Marvel comic cover design, torn paper banners, Spidey greeting, live SSE activity ticker |
| **Tab 1: Spiderweb Explorer Map ("The Web")** | NYC interactive node network graph | Spiderweb canvas with gray/neon lit nodes, bezier web-shooting animations (`THWIP!`), node mission drawers |
| **Tab 2: Mission Hub ("Explore & Help")** | Cultural missions & civic bounties list | Comic issue mission cards, Spidey lens camera upload frame, GPS intake, RLUSD reward badges |
| **Tab 3: Digital Passport ("Collectible Cards")** | Solana Metaplex soulbound trading cards | Booster-pack card gallery, 3D flip card viewer (Front: landmark comic artwork & stamp; Back: audit metadata) |
| **Tab 4: Spidey-Bot AI Referee Audit ("Ledger Audit")** | Transparent AI security & decision audit | Animated Spidey-Bot avatar with eye lens expressions, 5-gate pipeline beam, interactive Guardrail Attack Simulator |

---

## Backend API Dependencies

All calls go through `api.js` (`window.WebPassApi`).

* `GET /places`: mission names, rewards and geofence radii
* `POST /auth/request-code`, `POST /auth/verify`: email login, returns a token and both wallet addresses
* `GET /me/nft`, `GET /me/rlusd-balance`: the passport stamps and RLUSD balance for the logged in user
* `POST /submissions`: photo, location, GPS trail, wallet addresses, and optional caption (see below)
* `GET /decisions/:id`: audit trail, replayed on the 5 gates after each submission
* `GET /events`: live decision stream (Server-Sent Events) for the ticker
* `POST /test/attack` / `DELETE /test/attack`: policy-bypass toggle, only mounted when `NODE_ENV=test` (404 otherwise)

---

## Submitting a Visit: Camera and GPS Trail

The server no longer trusts a single latitude and longitude. While the camera
is open, the page must sample the phone's GPS every couple of seconds for about
20 seconds and send those readings as `locationTrail` (a JSON array of
`{ latitude, longitude, accuracy, timestamp }`, oldest first, timestamps in
epoch ms). The submitted `latitude` and `longitude` must be the last reading.
A submission without a trail is blocked with 422 `BLOCKED_SENTINEL`.

`locationCapture.js` does all of this and exposes `window.WebPassCapture`:

```js
const result = await WebPassCapture.verifyVisit({
  apiBase: 'http://localhost:3000',
  placeId: 'apollo-theater',
  video: document.querySelector('video'),
  xrplAddress,
  solanaAddress,
  caption,
  onProgress: ({ readings, secondsLeft }) => showProgress(readings, secondsLeft),
});
// result.status is 202 when paid, 422 with result.body.reasons when blocked
```

The smaller pieces (`openCamera`, `collectTrail`, `capturePhoto`,
`buildSubmission`) can be used on their own for a custom flow.

Notes:

* Camera and location only work on `https://` pages or `http://localhost`.
* The backend serves this folder, so `npm run dev` at the repo root and
  http://localhost:3000 is all you need. The API also sends CORS headers, so a
  separate static server works too: `api.js` uses the page's own origin when it
  answers `/health`, otherwise `http://localhost:3000`, and `?api=` overrides
  both.
* `?demo=1` shows a checkbox that sends a simulated GPS trail near the place,
  for demos away from the real location.
* What gets blocked: no trail, fewer than 5 readings or under 10 seconds,
  readings that never move (a browser location override), accuracy of 1 m or
  better or worse than 200 m, coordinates with 4 or fewer decimals or exactly on
  the place's pin, a wallet moving faster than 80 km/h since its last check-in,
  and a third wallet sending the exact same point as two others within 24 hours.
