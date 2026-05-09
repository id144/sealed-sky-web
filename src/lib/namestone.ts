/**
 * NameStone integration — issue ENS subdomains under a hosted parent domain.
 *
 * Configure two env vars at build time (see .env.example):
 *   VITE_NAMESTONE_API_KEY = your namestone API key
 *   VITE_NAMESTONE_DOMAIN  = the parent domain you registered, e.g. "id144.eth"
 *
 * If either is missing the integration silently disables itself — the rest of
 * the app keeps working without ENS subdomain publishing.
 *
 * Network path: requests go to `/namestone/...` which is proxied to
 * `https://namestone.com/api/public_v1/...`:
 *   - Dev   — via vite.config.ts `server.proxy["/namestone"]`
 *   - Prod  — via vercel.json `rewrites`
 * Same code, both environments, no API key in the page's CORS surface.
 */

const NAMESTONE_API = "/namestone";

export const NAMESTONE_API_KEY = (import.meta.env.VITE_NAMESTONE_API_KEY ?? "") as string;
export const NAMESTONE_DOMAIN = (import.meta.env.VITE_NAMESTONE_DOMAIN ?? "") as string;

const DEFAULT_OWNER = "0x000000000000000000000000000000000000dEaD";

export function isNameStoneConfigured(): boolean {
  return !!(NAMESTONE_API_KEY && NAMESTONE_DOMAIN);
}

/** Generate a short capsule label like "cap-3f2a9c1b". */
export function generateCapsuleLabel(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return `cap-${hex}`;
}

/** True when a NameStone subdomain label is one of our auto-generated capsules. */
function isCapsuleLabel(label: string): boolean {
  return /^cap-[0-9a-f]{8}$/i.test(label);
}

export interface PublishCapsuleArgs {
  label: string;
  ownerAddress?: string | null;
  textRecords: Record<string, string>;
}

/**
 * Issue a subdomain under our parent and set its text records in one call.
 * Returns the fully qualified ENS name on success.
 */
export async function publishCapsule(args: PublishCapsuleArgs): Promise<string> {
  if (!isNameStoneConfigured()) {
    throw new Error(
      "NameStone not configured (VITE_NAMESTONE_API_KEY / VITE_NAMESTONE_DOMAIN missing)",
    );
  }
  const owner = args.ownerAddress?.startsWith("0x") ? args.ownerAddress : DEFAULT_OWNER;
  const body = {
    domain: NAMESTONE_DOMAIN,
    name: args.label,
    address: owner,
    text_records: args.textRecords,
  };
  const r = await fetch(`${NAMESTONE_API}/set-name`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: NAMESTONE_API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`NameStone set-name HTTP ${r.status}: ${text || r.statusText}`);
  }
  return `${args.label}.${NAMESTONE_DOMAIN}`;
}

export interface CapsuleRecords {
  envelope: string;
  unlockUnix: number | null;
  backend: string | null;
  senderEns: string | null;
  recipientEns: string | null;
  createdAt: number | null;
}

interface NameStoneRow {
  name?: string;
  domain?: string;
  address?: string;
  text_records?: Record<string, string>;
}

/** Fetch a single NameStone row by full or short name. Used by fetchCapsuleByEns. */
async function fetchRowByName(fqnOrLabel: string): Promise<NameStoneRow | null> {
  if (!isNameStoneConfigured()) return null;
  // Accept "cap-…" or "cap-….id144.eth" — the NameStone API takes just the label
  // along with its domain. Split on the first dot.
  const dot = fqnOrLabel.indexOf(".");
  const label = dot === -1 ? fqnOrLabel : fqnOrLabel.slice(0, dot);
  const domain = dot === -1 ? NAMESTONE_DOMAIN : fqnOrLabel.slice(dot + 1);
  const url = `${NAMESTONE_API}/get-names?domain=${encodeURIComponent(domain)}&name=${encodeURIComponent(label)}`;
  try {
    const r = await fetch(url, { headers: { Authorization: NAMESTONE_API_KEY } });
    if (!r.ok) return null;
    const body = (await r.json()) as NameStoneRow[];
    if (!Array.isArray(body)) return null;
    // The API ignores the `name=` filter at present and returns ALL rows under
    // the domain — so we filter client-side.
    return body.find((row) => row?.name === label) ?? null;
  } catch {
    return null;
  }
}

/**
 * Read an envelope back from a NameStone-issued ENS subdomain.
 *
 * We hit NameStone's REST API directly rather than going through CCIP-Read /
 * viem — same data, fewer moving parts, no chance of universalResolver gateway
 * flakes. The capsule's ENS subdomain is still the public, branded surface;
 * this is just how *we* read it back inside the app.
 *
 * For non-NameStone names this falls back to viem's text-record reader.
 */
export async function fetchCapsuleByEns(name: string): Promise<CapsuleRecords | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  // Prefer the REST API when the name lives under our NameStone parent domain.
  if (
    isNameStoneConfigured() &&
    (trimmed === NAMESTONE_DOMAIN ||
      trimmed.toLowerCase().endsWith(`.${NAMESTONE_DOMAIN.toLowerCase()}`))
  ) {
    const row = await fetchRowByName(trimmed);
    if (!row?.text_records) return null;
    const t = row.text_records;
    const envelope = t.envelope;
    if (!envelope) return null;
    return {
      envelope,
      unlockUnix: t.unlock_unix ? parseInt(t.unlock_unix, 10) : null,
      backend: t.backend ?? null,
      senderEns: t.sender_ens ?? null,
      recipientEns: t.recipient_ens ?? null,
      createdAt: t.created_at ? parseInt(t.created_at, 10) : null,
    };
  }

  // Fallback for arbitrary ENS names (rare path — used if you ever import a
  // capsule hosted elsewhere). Lazy-import to avoid pulling viem if unused.
  const { readEnsText } = await import("./ens");
  const envelope = await readEnsText(trimmed, "envelope");
  if (!envelope) return null;
  const [unlockStr, backend, sender, recipient, createdStr] = await Promise.all([
    readEnsText(trimmed, "unlock_unix"),
    readEnsText(trimmed, "backend"),
    readEnsText(trimmed, "sender_ens"),
    readEnsText(trimmed, "recipient_ens"),
    readEnsText(trimmed, "created_at"),
  ]);
  return {
    envelope,
    unlockUnix: unlockStr ? parseInt(unlockStr, 10) : null,
    backend,
    senderEns: sender,
    recipientEns: recipient,
    createdAt: createdStr ? parseInt(createdStr, 10) : null,
  };
}

/**
 * Reverse-lookup helper: ask NameStone which names are registered to an
 * address inside our parent domain. Used as a fallback when the standard
 * on-chain ENS reverse record isn't set (common for NameStone-issued
 * subdomains, which are forward-only by default).
 *
 * Filters out our own auto-generated `cap-XXXXXXXX` capsule names so we
 * never display "from: cap-….id144.eth" as someone's identity.
 *
 * Returns the first matching human-style fully-qualified name, or null.
 */
export async function lookupNameViaNameStone(address: string): Promise<string | null> {
  if (!isNameStoneConfigured()) return null;
  if (!address || !address.startsWith("0x")) return null;
  const url = `${NAMESTONE_API}/get-names?domain=${encodeURIComponent(NAMESTONE_DOMAIN)}&address=${address}`;
  try {
    const r = await fetch(url, { headers: { Authorization: NAMESTONE_API_KEY } });
    if (!r.ok) return null;
    const body = (await r.json()) as NameStoneRow[];
    if (!Array.isArray(body) || body.length === 0) return null;
    const human = body
      .map((row) => row?.name)
      .filter((n): n is string => typeof n === "string" && n.length > 0)
      .find((n) => !isCapsuleLabel(n));
    if (!human) return null;
    return `${human}.${NAMESTONE_DOMAIN}`;
  } catch {
    return null;
  }
}
