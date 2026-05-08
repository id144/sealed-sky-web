# Sealed Sky — Frontend Demo

Browser companion to the Python `sealed_sky.py` CLI. Two backends share one UI:

- **drand timelock** — true non-interactive timelock via BLS12-381 IBE on quicknet. Same wire format as the CLI.
- **SpaceComputer cTRNG (commit-reveal)** — AES-256-GCM with a browser-held key, commitment bound to a future cosmic-randomness beacon block from orbit. The beacon block is fetched from IPFS as a publicly verifiable witness at unlock time.

No server, no backend. All crypto runs in the browser.

## Run

```bash
cd sealed-sky-web
npm install
npm run dev      # http://localhost:5173
npm run build    # static dist/ ready for Vercel/Netlify/GH Pages
```

## Publishing & sharing

The site is fully static — `npm run build` emits `dist/` and that's it. Drop it on any static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages). All crypto runs client-side, no backend.

Before deploying, swap the placeholder origin `https://sealed-sky.example.com` for your real deployed URL in:

- [`index.html`](index.html) — `og:url`, `og:image`, `twitter:image`, oEmbed `<link>`, `<link rel="canonical">`, JSON-LD.
- [`public/oembed.json`](public/oembed.json) — `provider_url`, `author_url`, `thumbnail_url`.
- [`public/robots.txt`](public/robots.txt) — `Sitemap:` line.
- [`public/sitemap.xml`](public/sitemap.xml) — `<loc>`, `<lastmod>`.
- [`package.json`](package.json) — `homepage`.

A quick way to do it all at once on Linux/macOS:

```bash
ORIGIN="https://your-deployment.example.com"
grep -rl "sealed-sky.example.com" . --include="*.html" --include="*.json" --include="*.md" --include="*.txt" --include="*.xml" \
  | xargs sed -i.bak "s|https://sealed-sky.example.com|${ORIGIN}|g"
find . -name "*.bak" -delete
```

### Social-card image (PNG for Twitter/X)

`og-image.svg` ships with the project and works on Slack, Discord, Telegram, LinkedIn, and Facebook out of the box. Twitter/X does **not** render SVG OG images — generate a PNG copy and update the meta tags:

```bash
# ImageMagick
magick public/og-image.svg -resize 1200x630 public/og-image.png

# or rsvg-convert (cleaner type rendering)
rsvg-convert -w 1200 -h 630 public/og-image.svg -o public/og-image.png
```

Then change three lines in `index.html` (`og:image`, `og:image:type` → `image/png`, `twitter:image`) and `thumbnail_url` in `oembed.json` to point at `og-image.png`.

### What's included for sharing

- **Open Graph** — title, description, 1200×630 cover image, site name, locale, image alt.
- **Twitter / X Card** — `summary_large_image` style with full description and image.
- **oEmbed discovery** — `<link rel="alternate" type="application/json+oembed">` pointing at `/oembed.json`. Discord and a few other clients honor it.
- **Schema.org JSON-LD** — `WebApplication` markup with `isPartOf` linking the ETH Prague 2026 hackathon. Helps search engines.
- **Favicon** — gold star-with-trail SVG matching the app's brand mark.
- **Theme color** — `#0a0910` so mobile browser chrome blends into the deep-space backdrop.
- **robots.txt + sitemap.xml** — minimal but valid; signals the site is open to crawlers.

## What it does

1. **Compose** — type a message, pick a future unlock time. Default: now + 5 min.
2. **Seal** — encrypts to the drand round whose published time is ≥ the chosen unlock. Pushes a sealed envelope into the queue.
3. **Queue** — every 2.5 s the app polls drand for any rounds whose unlock time has passed. When the round signature is published, the row decrypts itself.
4. **Detail** — selected row shows the envelope blob (copyable), the round number, the verify URL, and the plaintext once unsealed.

State is persisted to `localStorage` so a page refresh mid-queue keeps everything.

## Envelope (interop with the CLI)

The envelope is identical to `sealed_sky.py`'s `pack_envelope`:

```
base64( JSON({
  v: 1,
  chain: "quicknet",
  chain_hash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  round: <int>,
  backend: "timelock",
  ct: "<base64 of raw tlock binary AGE bytes>"
}) )
```

`tlock-js` natively returns an *armored* AGE string. Before packing the envelope we call `decodeArmor` to reduce it to raw binary AGE bytes — that's what the Python `timelock` Rust crate produces, and what the CLI expects in `ct`.

## Interop test

Browser → CLI:

```bash
# 1. In the browser, seal a short message with a 30 s delay.
# 2. Copy the envelope from the Detail panel.
# 3. Wait until the unlock time, then in a Linux + CPython 3.10 shell:
echo "<paste envelope>" | python sealed_sky.py decrypt --input -
```

CLI → browser:

```bash
python sealed_sky.py encrypt "hello from cli" --delay 30 --out msg.seal
# Open the browser app, paste the contents of msg.seal into a small
# "import envelope" UI hook (TODO) — for now you can paste it via DevTools:
#   localStorage.setItem("sealed-sky.queue.v1", JSON.stringify([{
#     id: "imported", envelope: "<paste>", round: <round from CLI stderr>,
#     unlock_unix: <unlock from CLI stderr>, created_at: 0,
#     preview: "imported", status: "sealed"
#   }])); location.reload();
```

Caveat: the `--pure` Python backend uses an entirely different (non-AGE) ciphertext format — only `pure ↔ pure` round-trips. The browser uses the standard AGE format and is interoperable with the Rust-backed `timelock` Python backend.

## Stack

- **Vite + React + TypeScript** — minimal, no router.
- **tlock-js 0.9.0** — `timelockEncrypt`, `timelockDecrypt`. Returns armored AGE strings; we un-armor for raw bytes.
- **drand-client 1.4.2** — verified `HttpChainClient` pinned to quicknet's chain hash + public key.
- **Web Crypto** — AES-256-GCM + SHA-256 for the cTRNG commit-reveal path; no extra deps.
- **SpaceComputer cTRNG IPFS beacon** — public IPNS, ~60 s cadence, no auth: `/ipns/k2k4r8lvomw737sajfnpav0dpeernugnryng50uheyk1k39lursmn09f`. Gateways: `ipfs.io` → `dweb.link` → `gateway.pinata.cloud` (fallbacks).
- **No backend.** Everything runs in the browser; drand and IPFS are CORS-allowed.

## cTRNG (commit-reveal) mode

cTRNG isn't a like-for-like replacement for drand's IBE. It's a randomness beacon, not a trapdoor primitive — you can't encrypt-now to "the value the satellites will publish at block N". So this mode is **classic commit-reveal with the beacon as a publicly-verifiable witness**:

**Seal:**
1. Generate a 32-byte AES key K with `crypto.getRandomValues`.
2. AES-256-GCM encrypt the plaintext under K with a fresh 12-byte IV.
3. Compute `commit = SHA-256("sealed-sky/ctrng-cr-v1" ‖ K ‖ IV ‖ unlock_unix_be8)`.
4. Optionally fetch the latest beacon block to estimate the target sequence (`current.sequence + ⌈(unlock_unix - current.timestamp) / 60⌉`). Beacon failure here is non-fatal — encryption doesn't need it.
5. Pack envelope: `{ v, scheme: "ctrng-cr-v1", beacon, ipns_key, unlock_unix, target_sequence?, ct, iv, commit }`.
6. **K is stored only in this browser's localStorage**, never in the envelope. The envelope alone reveals nothing.

**Reveal (after unlock_unix):**
1. Fetch the latest beacon block from IPFS.
2. Verify `block.timestamp >= unlock_unix` — that's the witness condition. If not yet, retry next poll tick.
3. Recompute the commitment from the locally-held K and verify it matches the envelope.
4. AES-GCM decrypt; display the plaintext + the witness block (sequence, timestamp, randomness, gateway URL).

**Honest limitations.** Because K lives in the originating browser, this is *not* "anyone can decrypt at unlock time". A production deployment would publish K to a smart contract (or a threshold reveal service) at unlock time so anyone with the envelope can derive the plaintext — the on-chain commit verifies against `commit` and the cTRNG block witness. The browser demo simulates the public-witness piece; the key-distribution piece is left as a stub.

**Years-scale unlocks work.** The seal step doesn't need any beacon interaction at all, and the reveal step only needs the *latest* beacon block (proves the unlock time has passed and the source is live). No chain walking required.

## Layout

```
src/
  lib/
    backend.ts          drand vs ctrng types + descriptions
    bytes.ts            base64/hex/u64-BE/concat helpers
    drand.ts            chain config, round arithmetic, signature fetch
    envelope.ts         drand envelope pack/unpack — matches CLI exactly
    envelope-ctrng.ts   cTRNG envelope pack/unpack
    tlock.ts            drand encrypt/decrypt wrappers around tlock-js
    symmetric.ts        AES-256-GCM seal/open + SHA-256 commitment
    ctrng.ts            IPFS beacon fetcher + gateway fallbacks
    queue.ts            localStorage-backed item store + state machine
    format.ts           countdown / time formatting helpers
  components/
    Compose.tsx         backend selector + message + unlock-time + Seal
    Queue.tsx           row list with status + backend badges
    Detail.tsx          envelope inspector + per-backend metadata + plaintext
  App.tsx               wires everything; runs the 2.5 s poll loop
  main.tsx              entry; installs Buffer polyfill for tlock-js
  index.css             dark theme
```

## State machine per item

```
sealed   ──(unlock_unix ≤ now)──▶ ready ──(fetch sig 200)──▶ unsealing ──▶ unsealed
                                    │                              │
                                    └──(404/425)──▶ ready (retry)  └──(throw)──▶ error
```

Plaintext is only stored *after* unsealing (per the brief: never persist plaintext-before-encryption).
