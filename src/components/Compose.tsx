import { useEffect, useState } from "react";
import { defaultUnlockLocal, localInputToUnix } from "../lib/format";
import { BACKENDS, BACKEND_ORDER, DEFAULT_BACKEND, type Backend } from "../lib/backend";
import { resolveEnsAddress, looksLikeEns } from "../lib/ens";

export interface SealOptions {
  recipientEns?: string;
}

interface Props {
  onSeal: (
    message: string,
    unlockUnix: number,
    backend: Backend,
    options: SealOptions,
  ) => Promise<void>;
  disabled?: boolean;
  senderEns?: string | null;
}

type RecipientStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "resolved"; address: string }
  | { kind: "unresolved" };

export function Compose({ onSeal, disabled, senderEns }: Props) {
  const [message, setMessage] = useState("");
  const [unlockAt, setUnlockAt] = useState(defaultUnlockLocal());
  const [backend, setBackend] = useState<Backend>(DEFAULT_BACKEND);
  const [recipient, setRecipient] = useState("");
  const [recipientStatus, setRecipientStatus] = useState<RecipientStatus>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Live resolve recipient ENS as the user types, debounced.
  useEffect(() => {
    const trimmed = recipient.trim();
    if (!trimmed) {
      setRecipientStatus({ kind: "idle" });
      return;
    }
    if (!looksLikeEns(trimmed)) {
      setRecipientStatus({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setRecipientStatus({ kind: "checking" });
    const t = window.setTimeout(async () => {
      const addr = await resolveEnsAddress(trimmed);
      if (cancelled) return;
      setRecipientStatus(addr ? { kind: "resolved", address: addr } : { kind: "unresolved" });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [recipient]);

  async function handleSeal() {
    setErr(null);
    if (!message.trim()) {
      setErr("Message is empty.");
      return;
    }
    const unlockUnix = localInputToUnix(unlockAt);
    if (!Number.isFinite(unlockUnix)) {
      setErr("Pick a valid unlock time.");
      return;
    }
    setBusy(true);
    try {
      await onSeal(message, unlockUnix, backend, {
        recipientEns: recipient.trim() || undefined,
      });
      setMessage("");
      setUnlockAt(defaultUnlockLocal());
      setRecipient("");
      setRecipientStatus({ kind: "idle" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel compose">
      <h2>Compose</h2>
      <div className="backend-picker">
        {BACKEND_ORDER.map((kind) => {
          const b = BACKENDS[kind];
          return (
            <label
              key={b.kind}
              className={`backend-option ${backend === b.kind ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="backend"
                value={b.kind}
                checked={backend === b.kind}
                onChange={() => setBackend(b.kind)}
                disabled={busy || disabled}
              />
              <div>
                <div className="backend-label">{b.label}</div>
                <div className="backend-tagline">{b.tagline}</div>
              </div>
            </label>
          );
        })}
      </div>
      <textarea
        rows={4}
        placeholder="Write a message that only the future can read…"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={busy || disabled}
      />
      <div className="row recipient-row">
        <label>
          To (optional ENS)
          <input
            type="text"
            placeholder="vlad3d.eth"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            disabled={busy || disabled}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className={`recipient-status status-${recipientStatus.kind}`}>
          {recipientStatus.kind === "checking" && "resolving…"}
          {recipientStatus.kind === "resolved" && (
            <>→ {recipientStatus.address.slice(0, 6)}…{recipientStatus.address.slice(-4)}</>
          )}
          {recipientStatus.kind === "unresolved" && "unresolved"}
        </div>
      </div>
      <div className="row">
        <label>
          Unlock at
          <input
            type="datetime-local"
            value={unlockAt}
            onChange={(e) => setUnlockAt(e.target.value)}
            disabled={busy || disabled}
          />
        </label>
        <button onClick={handleSeal} disabled={busy || disabled}>
          {busy ? "Sealing…" : `Seal with ${BACKENDS[backend].short}`}
        </button>
      </div>
      {senderEns && (
        <div className="sender-hint">
          Will be sealed by <strong>{senderEns}</strong>
        </div>
      )}
      {err && <div className="error">{err}</div>}
    </section>
  );
}
