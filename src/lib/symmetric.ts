import { bytesToHex, concat, u64BeBytes } from "./bytes";

const COMMIT_LABEL = new TextEncoder().encode("sealed-sky/ctrng-cr-v1");

function buf(b: Uint8Array): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

export interface SymSealed {
  ct: Uint8Array;
  iv: Uint8Array;
  key: Uint8Array;
  commit: string;
}

export async function symSeal(plaintext: string, unlockUnix: number): Promise<SymSealed> {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    buf(keyBytes),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: buf(iv) },
    cryptoKey,
    buf(new TextEncoder().encode(plaintext)),
  );
  const commit = await commitment(keyBytes, iv, unlockUnix);
  return { ct: new Uint8Array(ctBuf), iv, key: keyBytes, commit };
}

export async function symOpen(
  ct: Uint8Array,
  iv: Uint8Array,
  keyBytes: Uint8Array,
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    buf(keyBytes),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const ptBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buf(iv) },
    cryptoKey,
    buf(ct),
  );
  return new TextDecoder().decode(ptBuf);
}

export async function commitment(
  keyBytes: Uint8Array,
  iv: Uint8Array,
  unlockUnix: number,
): Promise<string> {
  const data = concat(COMMIT_LABEL, keyBytes, iv, u64BeBytes(unlockUnix));
  const digest = await crypto.subtle.digest("SHA-256", buf(data));
  return bytesToHex(new Uint8Array(digest));
}

export async function verifyCommitment(
  expectedHex: string,
  keyBytes: Uint8Array,
  iv: Uint8Array,
  unlockUnix: number,
): Promise<boolean> {
  const got = await commitment(keyBytes, iv, unlockUnix);
  return constantTimeEqHex(got, expectedHex);
}

function constantTimeEqHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
