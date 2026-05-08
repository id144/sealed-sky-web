export const CTRNG_IPNS_KEY =
  "k2k4r8lvomw737sajfnpav0dpeernugnryng50uheyk1k39lursmn09f";

export const CTRNG_GATEWAYS = [
  `https://ipfs.io/ipns/${CTRNG_IPNS_KEY}`,
  `https://dweb.link/ipns/${CTRNG_IPNS_KEY}`,
  `https://gateway.pinata.cloud/ipns/${CTRNG_IPNS_KEY}`,
];

export interface BeaconBlock {
  sequence: number;
  timestamp: number;
  ctrng: string[];
  previous: string | null;
  source_url: string;
}

interface RawBlock {
  previous?: string | null;
  data?: {
    sequence?: number;
    timestamp?: number;
    ctrng?: string[];
  };
}

function normalize(raw: RawBlock, sourceUrl: string): BeaconBlock {
  const seq = raw?.data?.sequence;
  const ts = raw?.data?.timestamp;
  const r = raw?.data?.ctrng;
  if (typeof seq !== "number" || typeof ts !== "number" || !Array.isArray(r)) {
    throw new Error("malformed cTRNG beacon block");
  }
  return {
    sequence: seq,
    timestamp: ts,
    ctrng: r,
    previous: raw.previous ?? null,
    source_url: sourceUrl,
  };
}

export async function fetchLatestBeacon(): Promise<BeaconBlock> {
  let lastErr: unknown = null;
  for (const url of CTRNG_GATEWAYS) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        lastErr = new Error(`HTTP ${r.status}`);
        continue;
      }
      const raw = (await r.json()) as RawBlock;
      return normalize(raw, url);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("all cTRNG gateways failed");
}

export function gatewayUrlForCid(cidPath: string): string {
  // cidPath looks like "/ipfs/bafk..."
  const path = cidPath.startsWith("/") ? cidPath : `/${cidPath}`;
  return `https://ipfs.io${path}`;
}

const SECONDS_PER_BLOCK = 60;

export function estimateTargetSequence(
  unlockUnix: number,
  reference: BeaconBlock,
): number {
  const delta = unlockUnix - reference.timestamp;
  if (delta <= 0) return reference.sequence;
  return reference.sequence + Math.ceil(delta / SECONDS_PER_BLOCK);
}
