import { b64ToBytes } from "./bytes";
import type { Backend } from "./backend";
import { unpack as unpackDrand } from "./envelope";
import { unpackCtrng } from "./envelope-ctrng";
import type { QueueItem } from "./queue";

export function b64UrlEncode(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function b64UrlDecode(b64url: string): string {
  let s = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  return s;
}

/** Decode the outer base64+JSON of an envelope and return its backend kind. */
export function peekBackend(envelope: string): Backend {
  const utf8 = b64ToBytes(envelope.trim());
  const json = new TextDecoder().decode(utf8);
  const payload = JSON.parse(json) as Record<string, unknown>;
  if (typeof payload.scheme === "string" && payload.scheme === "ctrng-cr-v1") return "ctrng";
  if (typeof payload.chain_hash === "string") return "drand";
  throw new Error("unrecognised envelope shape");
}

export interface ImportedItem {
  envelope: string;
  createdAt: number;
  ctrngKeyB64?: string;
}

export function buildShareUrl(item: QueueItem): string {
  const base = `${window.location.origin}${window.location.pathname}`;

  // If the capsule has been published to ENS, prefer the short ENS URL.
  // For cTRNG we still need to embed K as a fragment param so the recipient
  // can decrypt; the ENS query gives the envelope, the fragment gives the key.
  if (item.capsule_ens) {
    const url = `${base}?ens=${encodeURIComponent(item.capsule_ens)}`;
    if (item.backend === "ctrng" && item.ctrng_key_b64) {
      return `${url}#k=${b64UrlEncode(item.ctrng_key_b64)}`;
    }
    return url;
  }

  // Fall back to the fragment-only reopen link.
  const params = new URLSearchParams();
  params.set("env", b64UrlEncode(item.envelope));
  params.set("t", String(item.created_at));
  if (item.backend === "ctrng" && item.ctrng_key_b64) {
    params.set("k", b64UrlEncode(item.ctrng_key_b64));
  }
  return `${base}#${params.toString()}`;
}

export function parseFragment(): ImportedItem | null {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const envUrl = params.get("env");
  if (!envUrl) return null;
  const envelope = b64UrlDecode(envUrl);
  const tStr = params.get("t");
  const createdAt = tStr && /^\d+$/.test(tStr) ? parseInt(tStr, 10) : Math.floor(Date.now() / 1000);
  const kUrl = params.get("k");
  const ctrngKeyB64 = kUrl ? b64UrlDecode(kUrl) : undefined;
  return { envelope, createdAt, ctrngKeyB64 };
}

/** Read just the cTRNG key from a fragment that has no envelope (used with ?ens=). */
export function readKeyFragment(): string | undefined {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return undefined;
  const params = new URLSearchParams(raw);
  const kUrl = params.get("k");
  return kUrl ? b64UrlDecode(kUrl) : undefined;
}

export function clearFragment(): void {
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

/**
 * Reconstruct a fresh QueueItem from an imported (envelope, createdAt, key?) tuple.
 * Status starts as "sealed" — the existing poll loop will move it to "ready" once
 * unlock_unix has passed, exactly like a freshly sealed item.
 */
export function buildItemFromImport(
  imp: ImportedItem,
  newId: () => string,
): QueueItem {
  const backend = peekBackend(imp.envelope);
  if (backend === "drand") {
    const { round, payload: _payload } = unpackDrand(imp.envelope);
    void _payload;
    // unlock_unix isn't stored in the drand envelope (the CLI doesn't carry it either);
    // we approximate from round × period + genesis on the consumer side via getChainInfo.
    // To avoid an async call here, we leave unlock_unix at 0 and let the App fix it up
    // after import using the cached chain info. But to keep imports self-contained, we
    // include enough info in the envelope already (round) and rely on App to compute
    // unlock_unix once chain info is available.
    return {
      id: newId(),
      backend: "drand",
      envelope: imp.envelope,
      round,
      unlock_unix: 0, // overwritten in App.tsx using getChainInfo()
      created_at: imp.createdAt,
      status: "sealed",
    };
  }
  // cTRNG
  const { unlockUnix, targetSequence } = unpackCtrng(imp.envelope);
  return {
    id: newId(),
    backend: "ctrng",
    envelope: imp.envelope,
    unlock_unix: unlockUnix,
    ctrng_target_sequence: targetSequence,
    ctrng_key_b64: imp.ctrngKeyB64,
    created_at: imp.createdAt,
    status: "sealed",
  };
}
