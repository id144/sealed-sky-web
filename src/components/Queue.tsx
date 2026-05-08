import type { QueueItem } from "../lib/queue";
import { truncate } from "../lib/queue";
import { formatCountdown, formatLocal } from "../lib/format";
import { BACKENDS } from "../lib/backend";

interface Props {
  items: QueueItem[];
  selectedId: string | null;
  now: number;
  onSelect: (id: string) => void;
  onUnseal: (id: string) => void;
  onDelete: (id: string) => void;
}

const STATUS_LABEL: Record<QueueItem["status"], string> = {
  sealed: "sealed",
  ready: "ready",
  unsealing: "unsealing…",
  unsealed: "unsealed",
  error: "error",
};

function backendBadge(item: QueueItem): string {
  if (item.backend === "drand") {
    return item.round !== undefined ? `drand · round ${item.round}` : "drand";
  }
  return item.ctrng_target_sequence !== undefined
    ? `cTRNG · seq ~${item.ctrng_target_sequence}`
    : "cTRNG";
}

export function Queue({ items, selectedId, now, onSelect, onUnseal, onDelete }: Props) {
  if (items.length === 0) {
    return (
      <section className="panel queue">
        <h2>Queue</h2>
        <p className="empty">Nothing sealed yet. Compose a message to get started.</p>
      </section>
    );
  }

  return (
    <section className="panel queue">
      <h2>Queue ({items.length})</h2>
      <ul>
        {items.map((it) => {
          const remaining = it.unlock_unix * 1000 - now;
          const selected = it.id === selectedId;
          return (
            <li
              key={it.id}
              className={`item status-${it.status} backend-${it.backend} ${selected ? "selected" : ""}`}
              onClick={() => onSelect(it.id)}
            >
              <div className="item-row">
                <span className={`badge badge-${it.status}`}>{STATUS_LABEL[it.status]}</span>
                <span className={`badge badge-backend backend-${it.backend}`}>
                  {BACKENDS[it.backend].short}
                </span>
                <span className="round">{backendBadge(it)}</span>
                <span className="countdown">
                  {it.status === "unsealed"
                    ? "unlocked"
                    : it.status === "ready" || it.status === "unsealing"
                      ? "ready"
                      : `unlocks in ${formatCountdown(remaining)}`}
                </span>
              </div>
              {(it.sender_ens || it.recipient_ens) && (
                <div className="ens-line">
                  {it.sender_ens && (
                    <>
                      <span className="ens-label">from</span>
                      <span className="ens-name">{it.sender_ens}</span>
                    </>
                  )}
                  {it.sender_ens && it.recipient_ens && (
                    <span className="ens-arrow">→</span>
                  )}
                  {it.recipient_ens && (
                    <>
                      <span className="ens-label">to</span>
                      <span className="ens-name">{it.recipient_ens}</span>
                    </>
                  )}
                </div>
              )}
              {it.status === "unsealed" && it.plaintext !== undefined ? (
                <div className="preview">{truncate(it.plaintext)}</div>
              ) : (
                <div className="preview sealed-placeholder">— sealed —</div>
              )}
              <div className="locked-at">
                <span className="label">sealed</span>
                {formatLocal(it.created_at)}
              </div>
              <div className="item-actions">
                {it.status === "ready" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnseal(it.id);
                    }}
                  >
                    Unseal
                  </button>
                )}
                {it.status === "error" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnseal(it.id);
                    }}
                  >
                    Retry
                  </button>
                )}
                <button
                  className="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(it.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
