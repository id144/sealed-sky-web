import { createPublicClient, http } from "viem";
import { normalize } from "viem/ens";
import { mainnet } from "viem/chains";

type Hex = `0x${string}`;

// Public ENS reads. Cloudflare's mainnet RPC is CORS-friendly and free.
// viem's universalResolver handles CCIP-Read, so off-chain ENS providers
// (like NameStone) resolve transparently here.
export const ensClient = createPublicClient({
  chain: mainnet,
  transport: http("https://cloudflare-eth.com"),
});

const reverseCache = new Map<string, string | null>();
const forwardCache = new Map<string, Hex | null>();
const textCache = new Map<string, string | null>();

/** Reverse-resolve an ETH address to its primary ENS name. */
export async function lookupEnsName(addr: Hex): Promise<string | null> {
  const k = addr.toLowerCase();
  if (reverseCache.has(k)) return reverseCache.get(k)!;
  try {
    const name = await ensClient.getEnsName({ address: addr });
    reverseCache.set(k, name);
    return name;
  } catch {
    reverseCache.set(k, null);
    return null;
  }
}

/** Forward-resolve an ENS name to its address. Returns null if unresolved. */
export async function resolveEnsAddress(name: string): Promise<Hex | null> {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed || !looksLikeEns(trimmed)) return null;
  if (forwardCache.has(trimmed)) return forwardCache.get(trimmed)!;
  try {
    const addr = await ensClient.getEnsAddress({ name: normalize(trimmed) });
    forwardCache.set(trimmed, addr);
    return addr;
  } catch {
    forwardCache.set(trimmed, null);
    return null;
  }
}

/** Read a single text record from an ENS name. */
export async function readEnsText(name: string, key: string): Promise<string | null> {
  const cacheKey = `${name.toLowerCase()}|${key}`;
  if (textCache.has(cacheKey)) return textCache.get(cacheKey)!;
  try {
    const value = await ensClient.getEnsText({ name: normalize(name), key });
    textCache.set(cacheKey, value);
    return value;
  } catch {
    textCache.set(cacheKey, null);
    return null;
  }
}

export function looksLikeEns(name: string): boolean {
  const s = name.trim().toLowerCase();
  if (!s) return false;
  if (!s.includes(".")) return false;
  // Permissive: allow any label characters; viem's normalize() is the real validator.
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) || /^[a-z0-9_\-¡-￿]+(\.[a-z0-9_\-¡-￿]+)+$/i.test(s);
}

export function ensAppUrl(name: string): string {
  return `https://app.ens.domains/${encodeURIComponent(name)}`;
}
