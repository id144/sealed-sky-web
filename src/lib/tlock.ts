import { Buffer } from "buffer";
import {
  timelockEncrypt as tlEncrypt,
  timelockDecrypt as tlDecrypt,
} from "tlock-js";
import { decodeArmor } from "tlock-js/age/armor";
import { client } from "./drand";

const chainClient = client();

function binStrToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function bytesToBinStr(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

export async function encrypt(round: number, plaintext: string): Promise<Uint8Array> {
  const armored = await tlEncrypt(round, Buffer.from(plaintext, "utf-8"), chainClient);
  const rawBin = decodeArmor(armored);
  return binStrToBytes(rawBin);
}

export async function decrypt(ct: Uint8Array): Promise<string> {
  const buf = await tlDecrypt(bytesToBinStr(ct), chainClient);
  return Buffer.from(buf).toString("utf-8");
}
