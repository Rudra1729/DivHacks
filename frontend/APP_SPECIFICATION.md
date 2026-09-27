# WebPass NYC — Spider-Man Animated Theme & Frontend UI Specification

## 1. Executive Summary & Marvel/Spider-Verse Visual Vision

**WebPass NYC** is an action-packed, comic-book styled interactive city exploration and civic rewards app for New York City. Visualized like a giant **Marvel comic Spiderweb**, NYC starts dark and unexplored. As heroes explore the city, do civic good, and take verified photos, the web shoots out (**THWIP!**) and illuminates neighborhoods with vibrant colors, unlocking **Solana Soulbound Trading Cards** and **XRPL RLUSD micro-rewards**.

* **Theme Aesthetics:** High-octane Spider-Man / Spider-Verse comic book aesthetic (halftone dot pop art, torn paper collage banners, radial action rays, speech bubbles, bold action sound typography: *THWIP! POW! BOOM! GUARDIAN BLOCKED!*).
* **Grok AI Bot Referee:** Re-imagined as **"Spidey-Bot / Grok-Spidey"** — an animated Grok AI referee with expressive, animated Spider-Man eyes that react to submission verification gates in real-time.
* **Animations:** Dynamic canvas motion graphics, parallax floating stars/threads, web-shooting projectile animations on mission unlock, holographic comic card 3D tilts, and pulsing security audit beams.

---

## 2. Spider-Man Comic Aesthetic Design System

### 2.1 Color Palette & Textures
* **Hero Spidey Red:** `#E52421` / `#D32F2F` (Primary action, headers, suit accents)
* **Web Blue:** `#0055A5` / `#1976D2` (Primary brand blue, web nodes)
* **Comic Ink Black:** `#121212` / `#0A0A0A` (Heavy outlines, comic boxes, shadows)
* **Comic Newsprint Paper:** `#F7F4EB` / `#FFFDF5` (Warm off-white background texture)
* **Neon Web Glow Cyan:** `#00F0FF` (Glowing active web threads & pulse beams)
* **Spidey Suit Yellow Accent:** `#FFCC00` (Comic stars, warning banners, reward badges)
* **Halftone Overlay Pattern:** Classic pop-art dot grid background pattern across containers.
* **Torn Paper Edges:** Jagged comic-book paper tear borders separating sections.

### 2.2 Typography & Comic Callouts
* **Action Header Fonts:** Heavy comic display typography (e.g. *Bangers*, *Luckiest Guy*, *Permanent Marker*, or heavy uppercase display sans).
* **Action Sound Effects (Pop-Up Callouts):**
  * `THWIP!` — Plays on mission submission and web node unlock.
  * `POW! 1.0 RLUSD!` — Displayed when XRPL reward payout succeeds.
  * `SNAG! PHOTO REUSE!` — Displayed when Sentinel blocks a duplicate photo.
  * `BLOCKED BY POLICY!` — Comic speech bubble when policy engine catches an overspend.

---

## 3. Spidey-Bot / Grok AI Referee Avatar Specification

The AI Referee (Grok) is visually represented as an **interactive Spidey-Bot Avatar** with animated lens eyes:

| AI Referee State | Spidey-Bot Visual Expression | Eye Lens Animation | Audio/Visual Effect |
| :--- | :--- | :--- | :--- |
| **Idle / Listening** | Floating comic Spidey mask | Soft pulsing white lenses, blinking occasionally | Subtle floating bob animation |
| **Evaluating (Grok Proposal)** | Thinking posture with light rays | Narrowed scanning lenses with blue radar overlay | Rotating gear/lens reticle |
| **Approved (`OK`)** | Thumbs up / web shooting gesture | Bright glowing white/gold lenses | Green electric spark particles + `THWIP!` |
| **Sentinel Blocked (`BLOCKED_SENTINEL`)** | Crossing arms with red warning outline | Squinted red warning lenses | Red warning pulse + `SNAG!` badge |
| **Policy Blocked (`BLOCKED_POLICY`)** | Shielding hands with comic bubble | Flashing yellow/red hazard lenses | Shield impact splash + `GUARDRAIL HELD!` |
| **Attack Mode Active (`TEST_ATTACK`)** | Glitched comic suit effect | Dual-color glitching lenses (Red/Purple) | Voltage spark grid background |

---

## 4. Key Motion & Moving Animations Specification

### 4.1 "THWIP!" Web-Shooting Canvas Engine
* **Animation Sequence:**
  1. User submits mission proof.
  2. A glowing web thread shoots out from the user's location / center web hub to the target neighborhood node in a fast bezier curve (`0.4s`).
  3. The target node impacts with a web splash explosion effect and pop-art starburst.
  4. Neighborhood node transitions from gray to glowing neon colored state with an expanding light ring.
  5. `THWIP!` action sound typography pops up and fades up/out.

### 4.2 Dynamic Halftone Radial Action Rays
* Background elements feature rotating radial sunburst action rays (inspired by classic Marvel comic covers).
* Parallax scroll effect: rays rotate slowly in reverse direction to page scrolling.

### 4.3 3D Holographic Trading Card Flip
* **Tilt Interaction:** Mouse move triggers 3D card tilt with a metallic holographic foil sheen shader.
* **Flip Motion:** Click action flips card 180° around Y-axis with realistic paper/foil perspective depth.

### 4.4 Security Pipeline Beam Motion
* Horizontal comic pipeline showing the backend gates:
  1. *Intake* → 2. *Solvency* → 3. *Sentinel* → 4. *Spidey-Bot Grok* → 5. *Policy Engine* → 6. *Reviewer* → 7. *Ledger Settlement* → 8. *Stamp Mint*.
* Active submission triggers a pulsing energy ball traveling along the comic pipeline, stopping at any gate that triggers a block.

---

## 5. Codebase & Backend API Mapping

| Backend Endpoint | Method | Functionality | Frontend Component/Tab Usage |
| :--- | :--- | :--- | :--- |
| `/places` | `GET` | Returns list of eligible NYC places, coordinates, `payable`, and `payableCheck` | **Spiderweb Map**, **Mission Hub** |
| `/submissions` | `POST` | Submits photo, GPS, wallet addresses, place ID | **Mission Verification Drawer / Form** |
| `/users/:wallet/stamps` | `GET` | Fetches soulbound Solana stamps for a wallet | **Digital Passport & Collectible Cards** |
| `/decisions/:id` | `GET` | Fetches full audit history for a submission | **AI Referee Audit Modal** |
| `/events` | `GET` | SSE stream for real-time decision & verification logs | **AI Referee Live Stream Banner & Audit Log** |
| `/test/attack` | `POST` / `DELETE` | Toggles policy-bypass attack mode for testing | **AI Referee Guardrail Attack Simulator** |
| `/test/attack/force-proposal` | `POST` / `DELETE` | Test-only forced proposal route for the 50 RLUSD overspend demo | **AI Referee Guardrail Attack Simulator** |

---

## 6. Required Navigation & Tab Structure

The application header features a **Comic Action Banner Navigation Bar**:

1. **Landing Page (Hero & Spidey Story)**
2. **Tab 1: NYC Spiderweb Explorer ("The Web")**
3. **Tab 2: Mission Hub ("Explore & Help")**
4. **Tab 3: Digital Passport ("Collectible Cards")**
5. **Tab 4: Spidey-Bot AI Referee Command Center ("Ledger Audit")**

---

## 7. Detailed View & Tab Specifications

### 7.1 Landing Page / Hero Experience (Marvel Comic Cover Style)
* **Hero Banner:**
  * Bold slanted comic titles: **"SUIT UP HEROES! UNWEB NEW YORK CITY!"**
  * Spidey leaping pose graphic with torn paper collage layer background.
  * Subtitle: *"Explore Harlem & Morningside Heights, complete civic missions, earn RLUSD & collect non-transferable trading cards!"*
* **Interactive Spidey-Bot Greeting:** Spidey-Bot AI referee greeting visitors with animated speech bubbles explaining the guardrailed wallet system.
* **Live Ticker:** Comic ticker banner displaying live SSE events (`"HERO 0x4f... JUST UNLOCKED APOLLO THEATER! THWIP!"`).
* **CTA Button:** Red comic button with black border and yellow drop shadow: **"ENTER THE WEB & START EXPLORING"**.

### 7.2 Tab 1: NYC Spiderweb Explorer Map ("The Web")
* **Spiderweb Graph Renderer:**
  * NYC Map drawn as an intricate spiderweb network with node points for neighborhoods & landmarks.
  * Unexplored nodes: Dark slate gray with thin thread links.
  * Explored nodes: Vibrant glowing red/cyan with animated web pulse particles.
* **Interactive Node Card:** Clicking a node opens a comic speech bubble drawer showing mission details, place distance, and RLUSD bounty.
* **THWIP Motion Trigger:** Real-time web line draw on mission completion.

### 7.3 Tab 2: Mission Hub & Verification Form ("Missions")
* **Mission Cards:** Styled like comic action issue panels (bold border, halftone background texture, starburst reward badges).
  * *Cultural Missions:* Apollo Theater, Malcolm Shabazz Harlem Market, Studio Museum.
  * *Civic Missions:* Wheelchair Ramp Check, Community Fridge Verification.
* **Submission Drawer:**
  * Camera / Photo upload intake box styled as a Spidey Lens frame.
  * Live GPS device location checker with geofence indicator.
  * Wallet inputs (XRPL Address for RLUSD, Solana Address for Stamps).
  * Caption box for Spidey-Bot AI evaluation.
  * Big Red Action Button: **"SEND PROOF (THWIP!)"**.

### 7.4 Tab 3: Digital Passport & Collectible Cards ("Passport")
* **Collectible Trading Card Grid:** Displaying Solana Metaplex soulbound stamps in comic booster-pack styling.
* **3D Card Component:**
  * **Front:** Vintage comic book cover artwork of the landmark, neighborhood tag, discovery date, and "SOULBOUND / NON-TRANSFERABLE" stamp.
  * **Back:** Detailed audit payload, decision ID, Solana mint hash, XRPL payment hash, and Sentinel verification badge.

### 7.5 Tab 4: Spidey-Bot AI Referee Command Center ("Ledger Audit")
* **Spidey-Bot Live Status Window:** Interactive mascot with animated eyes reacting live to incoming SSE events.
* **Visual Pipeline:** Animated comic beam passing through Solvency → Sentinel → Grok Spidey → Policy Engine → Reviewer → XRPL → Solana.
* **Interactive Attack Simulator (Testing Mode):**
  * Toggle Switch to activate test attack mode (`POST /test/attack`).
  * Action buttons to launch simulated attacks:
    * *Attack 1: Duplicate Photo Fraud* → Triggers Sentinel alert animation + `SNAG!` callout.
    * *Attack 2: Grok Prompt Injection ($100 Request)* → Triggers Policy Guardrail block animation + `GUARDRAIL HELD!` banner.
    * *Attack 3: Ledger Allowance Bypass* → Uses the forced 50 RLUSD test route, shows policy stopping it first, then shows XRPL rejecting it when the test-only policy bypass is enabled.

---

## 8. Next Steps for Implementation

1. **Framework Setup:** Initialize Next.js/React app inside `frontend/`.
2. **Animation Engine Integration:** Setup Framer Motion / Canvas / CSS keyframes for web shooting, radial action rays, and 3D card tilt.
3. **Spidey-Bot Component:** Build the animated eye lens SVG avatar for Grok AI.
4. **Backend Event Stream:** Connect SSE client (`/events`) to trigger Spidey-Bot reactions and web node light-ups live.
