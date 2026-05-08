import { useState } from "react";
import { defaultUnlockLocal, localInputToUnix } from "../lib/format";
import { BACKENDS, BACKEND_ORDER, DEFAULT_BACKEND, type Backend } from "../lib/backend";

interface Props {
  onSeal: (message: string, unlockUnix: number, backend: Backend) => Promise<void>;
  disabled?: boolean;
}

export function Compose({ onSeal, disabled }: Props) {
  const [message, setMessage] = useState("");
  const [unlockAt, setUnlockAt] = useState(defaultUnlockLocal());
  const [backend, setBackend] = useState<Backend>(DEFAULT_BACKEND);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      await onSeal(message, unlockUnix, backend);
      setMessage("");
      setUnlockAt(defaultUnlockLocal());
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
      {err && <div className="error">{err}</div>}
    </section>
  );
}
