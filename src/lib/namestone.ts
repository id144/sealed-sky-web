/**
 * NameStone integration — issue ENS subdomains under a hosted parent domain.
 *
 * Configure two env vars at build time (see .env.example):
 *   VITE_NAMESTONE_API_KEY = your namestone API key
 *   VITE_NAMESTONE_DOMAIN  = the parent domain you registered, e.g. "sealed-sky.eth"
 *
 * If either is missing the integration silently disables itself — the rest of
 * the app keeps working without ENS subdomain publishing.
 */

import { readEnsText } from "./ens";

const NAMESTONE_API = "https://namestone.com/api/public_v1";

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
    throw new Error("NameStone not configured (VITE_NAMESTONE_API_KEY / VITE_NAMESTONE_DOMAIN missing)");
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

/**
 * Read an envelope back from an ENS name's text records.
 * Works with any ENS-resolvable name — viem's universal resolver handles
 * NameStone's CCIP-Read transparently. Returns null if no envelope record.
 */
export interface CapsuleRecords {
  envelope: string;
  unlockUnix: number | null;
  backend: string | null;
  senderEns: string | null;
  recipientEns: string | null;
  createdAt: number | null;
}

export async function fetchCapsuleByEns(name: string): Promise<CapsuleRecords | null> {
  const envelope = await readEnsText(name, "envelope");
  if (!envelope) return null;
  const [unlockStr, backend, sender, recipient, createdStr] = await Promise.all([
    readEnsText(name, "unlock_unix"),
    readEnsText(name, "backend"),
    readEnsText(name, "sender_ens"),
    readEnsText(name, "recipient_ens"),
    readEnsText(name, "created_at"),
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
