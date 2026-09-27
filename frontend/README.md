# WebPass NYC — Spider-Man Theme & Animated Frontend Overview

This folder contains the complete UI architecture, animation guide, and Spider-Man comic book design system for **WebPass NYC**.

For complete component specifications, animation triggers, Spidey-Bot expressions, and API mappings, see [APP_SPECIFICATION.md](file:///c:/Users/user/Documents/divhacks26/frontend/APP_SPECIFICATION.md).

---

## Spider-Man Theme & Visual Aesthetic

* **Comic Art Design:** Bold halftone dot background textures, radial action burst rays, torn paper collage banners, and comic sound callouts (*THWIP! POW! BOOM! GUARDRAIL HELD!*).
* **Color System:** Hero Red (`#E52421`), Web Blue (`#0055A5`), Ink Black (`#121212`), Off-White Paper (`#F7F4EB`), Neon Web Cyan (`#00F0FF`), Accent Yellow (`#FFCC00`).
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

* `GET /places` — Load spiderweb nodes & mission places
* `POST /submissions` — Submit photo, location, wallet addresses, and optional caption
* `GET /users/:wallet/stamps` — Fetch Solana soulbound stamps
* `GET /decisions/:id` — Inspect submission audit trail
* `GET /events` — Real-time decision stream (Server-Sent Events)
* `POST /test/attack` / `DELETE /test/attack` — Toggle policy-bypass test mode for demo attacks
