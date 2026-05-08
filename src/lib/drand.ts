import { HttpCachingChain, HttpChainClient, defaultChainOptions } from "drand-client";

export const CHAIN_HASH =
  "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";
export const CHAIN_NAME = "quicknet";
export const PUBLIC_KEY =
  "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a";
export const API_BASES = [
  `https://api.drand.sh/${CHAIN_HASH}`,
  `https://drand.cloudflare.com/${CHAIN_HASH}`,
];

export interface ChainInfo {
  public_key: string;
  period: number;
  genesis_time: number;
  hash: string;
  groupHash?: string;
  schemeID?: string;
  metadata?: { beaconID?: string };
}

export function client(): HttpChainClient {
  const opts = {
    ...defaultChainOptions,
    chainVerificationParams: { chainHash: CHAIN_HASH, publicKey: PUBLIC_KEY },
  };
  const chain = new HttpCachingChain(API_BASES[0], opts);
  return new HttpChainClient(chain, opts, { userAgent: "sealed-sky-web/0.1" });
}

let cachedInfo: ChainInfo | null = null;
export async function getChainInfo(): Promise<ChainInfo> {
  if (cachedInfo) return cachedInfo;
  const r = await fetch(`${API_BASES[0]}/info`);
  if (!r.ok) throw new Error(`drand /info HTTP ${r.status}`);
  cachedInfo = (await r.json()) as ChainInfo;
  return cachedInfo;
}

export function roundAtTime(targetUnix: number, info: ChainInfo): number {
  return Math.max(1, Math.ceil((targetUnix - info.genesis_time) / info.period));
}

export function timeAtRound(round: number, info: ChainInfo): number {
  return info.genesis_time + round * info.period;
}

export interface RoundResponse {
  round: number;
  signature: string;
  randomness: string;
}

export async function fetchRound(round: number): Promise<RoundResponse | null> {
  let lastErr: unknown = null;
  for (const base of API_BASES) {
    try {
      const r = await fetch(`${base}/public/${round}`);
      if (r.status === 404 || r.status === 425) return null;
      if (!r.ok) {
        lastErr = new Error(`HTTP ${r.status}`);
        continue;
      }
      return (await r.json()) as RoundResponse;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("all drand endpoints failed");
}

export function verifyUrl(round: number): string {
  return `${API_BASES[0]}/public/${round}`;
}
