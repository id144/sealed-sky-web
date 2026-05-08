import { CHAIN_HASH, CHAIN_NAME } from "./drand";
import { b64ToBytes, bytesToB64 } from "./bytes";

export const ENVELOPE_VERSION = 1;
export const BACKEND_TAG = "timelock";

export interface EnvelopePayload {
  v: number;
  chain: string;
  chain_hash: string;
  round: number;
  backend: string;
  ct: string;
  sender_ens?: string;
  recipient_ens?: string;
}

export function pack(
  round: number,
  ct: Uint8Array,
  options?: { senderEns?: string | null; recipientEns?: string | null },
): string {
  const payload: EnvelopePayload = {
    v: ENVELOPE_VERSION,
    chain: CHAIN_NAME,
    chain_hash: CHAIN_HASH,
    round,
    backend: BACKEND_TAG,
    ct: bytesToB64(ct),
  };
  if (options?.senderEns) payload.sender_ens = options.senderEns;
  if (options?.recipientEns) payload.recipient_ens = options.recipientEns;
  const utf8 = new TextEncoder().encode(JSON.stringify(payload));
  return bytesToB64(utf8);
}

export interface ParsedEnvelope {
  round: number;
  ct: Uint8Array;
  payload: EnvelopePayload;
}

export function unpack(blob: string): ParsedEnvelope {
  const utf8 = b64ToBytes(blob.trim());
  const json = new TextDecoder().decode(utf8);
  const payload = JSON.parse(json) as EnvelopePayload;
  if (payload.v !== ENVELOPE_VERSION) {
    throw new Error(`unsupported envelope version: ${payload.v}`);
  }
  if (payload.chain_hash !== CHAIN_HASH) {
    throw new Error(
      `envelope chain ${payload.chain_hash} != quicknet (${CHAIN_HASH})`,
    );
  }
  return { round: payload.round, ct: b64ToBytes(payload.ct), payload };
}
