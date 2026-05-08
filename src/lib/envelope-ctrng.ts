import { b64ToBytes, bytesToB64 } from "./bytes";
import { CTRNG_IPNS_KEY } from "./ctrng";

export const CTRNG_ENVELOPE_VERSION = 1;
export const CTRNG_SCHEME = "ctrng-cr-v1";
export const CTRNG_BEACON_NAME = "spacecomputer-ctrng";

export interface CtrngEnvelopePayload {
  v: number;
  scheme: string;
  beacon: string;
  ipns_key: string;
  unlock_unix: number;
  target_sequence?: number;
  ct: string;
  iv: string;
  commit: string;
  sender_ens?: string;
  recipient_ens?: string;
}

function bytesToB64Json(bytes: Uint8Array): string {
  return bytesToB64(bytes);
}

export function packCtrng(args: {
  unlockUnix: number;
  targetSequence?: number;
  ct: Uint8Array;
  iv: Uint8Array;
  commit: string;
  senderEns?: string | null;
  recipientEns?: string | null;
}): string {
  const payload: CtrngEnvelopePayload = {
    v: CTRNG_ENVELOPE_VERSION,
    scheme: CTRNG_SCHEME,
    beacon: CTRNG_BEACON_NAME,
    ipns_key: CTRNG_IPNS_KEY,
    unlock_unix: args.unlockUnix,
    target_sequence: args.targetSequence,
    ct: bytesToB64Json(args.ct),
    iv: bytesToB64Json(args.iv),
    commit: args.commit,
  };
  if (args.senderEns) payload.sender_ens = args.senderEns;
  if (args.recipientEns) payload.recipient_ens = args.recipientEns;
  const utf8 = new TextEncoder().encode(JSON.stringify(payload));
  return bytesToB64(utf8);
}

export interface ParsedCtrngEnvelope {
  unlockUnix: number;
  targetSequence?: number;
  ct: Uint8Array;
  iv: Uint8Array;
  commit: string;
  payload: CtrngEnvelopePayload;
}

export function unpackCtrng(blob: string): ParsedCtrngEnvelope {
  const utf8 = b64ToBytes(blob.trim());
  const json = new TextDecoder().decode(utf8);
  const payload = JSON.parse(json) as CtrngEnvelopePayload;
  if (payload.v !== CTRNG_ENVELOPE_VERSION) {
    throw new Error(`unsupported cTRNG envelope version: ${payload.v}`);
  }
  if (payload.scheme !== CTRNG_SCHEME) {
    throw new Error(`unexpected scheme: ${payload.scheme}`);
  }
  if (payload.ipns_key !== CTRNG_IPNS_KEY) {
    throw new Error(`envelope IPNS key mismatch: ${payload.ipns_key}`);
  }
  return {
    unlockUnix: payload.unlock_unix,
    targetSequence: payload.target_sequence,
    ct: b64ToBytes(payload.ct),
    iv: b64ToBytes(payload.iv),
    commit: payload.commit,
    payload,
  };
}
