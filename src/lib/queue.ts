import type { Backend } from "./backend";

export type ItemStatus = "sealed" | "ready" | "unsealing" | "unsealed" | "error";

export interface QueueItem {
  id: string;
  backend: Backend;
  envelope: string;
  unlock_unix: number;
  created_at: number;
  status: ItemStatus;
  plaintext?: string;
  error?: string;

  // drand-specific
  round?: number;

  // ctrng-specific (private key stays in localStorage only)
  ctrng_key_b64?: string;
  ctrng_target_sequence?: number;
  ctrng_witness_sequence?: number;
  ctrng_witness_timestamp?: number;
  ctrng_witness_value?: string;
  ctrng_witness_url?: string;

  // ENS metadata (Phase 1) — addressing layer, not crypto-binding
  sender_ens?: string;
  recipient_ens?: string;

  // ENS subdomain published for this capsule (Phase 2)
  capsule_ens?: string;
  capsule_publish_error?: string;
}

const KEY = "sealed-sky.queue.v1";

export function loadQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueueItem[];
    return parsed.map((it) => {
      // Strip any legacy `preview` field — that was derived from plaintext-before-encryption
      // and must never be persisted (see brief: confidentiality of sealed messages).
      const { preview: _legacy, ...rest } = it as QueueItem & { preview?: string };
      void _legacy;
      const migrated: QueueItem = { ...rest, backend: rest.backend ?? "drand" };
      if (migrated.status === "unsealing") migrated.status = "ready";
      return migrated;
    });
  } catch {
    return [];
  }
}

export function saveQueue(items: QueueItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function truncate(text: string, n = 60): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length <= n ? single : single.slice(0, n - 1) + "…";
}

export function findByEnvelope(items: QueueItem[], envelope: string): QueueItem | undefined {
  return items.find((it) => it.envelope === envelope);
}
