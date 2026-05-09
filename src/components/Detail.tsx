import { useState } from "react";
import type { QueueItem } from "../lib/queue";
import { formatLocal, formatUtc } from "../lib/format";
import { verifyUrl } from "../lib/drand";
import { BACKENDS } from "../lib/backend";
import { CTRNG_GATEWAYS } from "../lib/ctrng";
import { buildShareUrl } from "../lib/share";
import { ensAppUrl } from "../lib/ens";

interface Props {
  item: QueueItem | null;
}

type CopyState = "idle" | "envelope" | "link";

export function Detail({ item }: Props) {
  const [copied, setCopied] = useState<CopyState>("idle");

  if (!item) {
    return (
      <section className="panel detail">
        <h2>Detail</h2>
        <p className="empty">Select a sealed message to inspect its envelope.</p>
      </section>
    );
  }

  async function copyEnvelope() {
    if (!item) return;
    await navigator.clipboard.writeText(item.envelope);
    setCopied("envelope");
    setTimeout(() => setCopied("idle"), 1200);
  }

  async function copyShareUrl() {
    if (!item) return;
    await navigator.clipboard.writeText(buildShareUrl(item));
    setCopied("link");
    setTimeout(() => setCopied("idle"), 1200);
  }

  return (
    <section className="panel detail">
      <h2>Detail</h2>
      <dl>
        <dt>backend</dt>
        <dd>{BACKENDS[item.backend].label}</dd>

        {item.sender_ens && (
          <>
            <dt>from</dt>
            <dd>
              <a href={ensAppUrl(item.sender_ens)} target="_blank" rel="noreferrer">
                {item.sender_ens}
              </a>
            </dd>
          </>
        )}

        {item.recipient_ens && (
          <>
            <dt>to</dt>
            <dd>
              <a href={ensAppUrl(item.recipient_ens)} target="_blank" rel="noreferrer">
                {item.recipient_ens}
              </a>
            </dd>
          </>
        )}

        {item.capsule_ens && (
          <>
            <dt>capsule ENS</dt>
            <dd>
              <a href={ensAppUrl(item.capsule_ens)} target="_blank" rel="noreferrer">
                {item.capsule_ens}
              </a>
            </dd>
          </>
        )}

        {item.capsule_publish_error && !item.capsule_ens && (
          <>
            <dt>capsule ENS</dt>
            <dd>
              <span className="error inline">publish failed: {item.capsule_publish_error}</span>
            </dd>
          </>
        )}

        {item.backend === "drand" && item.round !== undefined && (
          <>
            <dt>drand round</dt>
            <dd className="round-big">{item.round}</dd>
          </>
        )}

        {item.backend === "ctrng" && (
          <>
            <dt>cTRNG target sequence</dt>
            <dd className="round-big">
              {item.ctrng_target_sequence !== undefined
                ? `~${item.ctrng_target_sequence}`
                : "(unknown — beacon offline at seal)"}
            </dd>
          </>
        )}

        <dt>unlocks at (local)</dt>
        <dd>{formatLocal(item.unlock_unix)}</dd>
        <dt>unlocks at (UTC)</dt>
        <dd>{formatUtc(item.unlock_unix)}</dd>
        <dt>status</dt>
        <dd>
          {item.status}
          {item.error && <span className="error inline"> — {item.error}</span>}
        </dd>

        {item.backend === "drand" && item.round !== undefined && (
          <>
            <dt>verify (drand)</dt>
            <dd>
              <a href={verifyUrl(item.round)} target="_blank" rel="noreferrer">
                {verifyUrl(item.round)}
              </a>
            </dd>
          </>
        )}

        {item.backend === "ctrng" && (
          <>
            <dt>verify (cTRNG IPFS)</dt>
            <dd>
              <a href={CTRNG_GATEWAYS[0]} target="_blank" rel="noreferrer">
                {CTRNG_GATEWAYS[0]}
              </a>
            </dd>
          </>
        )}

        {item.backend === "ctrng" && item.ctrng_witness_sequence !== undefined && (
          <>
            <dt>witness block</dt>
            <dd className="round-big">seq {item.ctrng_witness_sequence}</dd>
            <dt>witness timestamp (UTC)</dt>
            <dd>{item.ctrng_witness_timestamp !== undefined ? formatUtc(item.ctrng_witness_timestamp) : "—"}</dd>
            <dt>witness randomness</dt>
            <dd>
              <code className="mono break">{item.ctrng_witness_value ?? "—"}</code>
            </dd>
            {item.ctrng_witness_url && (
              <>
                <dt>witness URL</dt>
                <dd>
                  <a href={item.ctrng_witness_url} target="_blank" rel="noreferrer">
                    {item.ctrng_witness_url}
                  </a>
                </dd>
              </>
            )}
          </>
        )}

        {item.backend === "ctrng" &&
          item.status === "unsealed" &&
          item.ctrng_witness_pending &&
          item.ctrng_witness_sequence === undefined && (
            <>
              <dt>witness</dt>
              <dd>
                <span className="witness-pending">
                  beacon catching up… cTRNG publishes every ~60 s and IPNS gateways can lag a few minutes. Will attach the next block whose timestamp is past the unlock.
                </span>
              </dd>
            </>
          )}
      </dl>

      <div className="envelope-block">
        <div className="envelope-header">
          <span>envelope</span>
          <div className="header-actions">
            <button onClick={copyEnvelope}>
              {copied === "envelope" ? "copied!" : "copy envelope"}
            </button>
            <button onClick={copyShareUrl}>
              {copied === "link" ? "copied!" : "copy reopen link"}
            </button>
          </div>
        </div>
        <textarea readOnly value={item.envelope} rows={6} />
        <div className="reopen-tip">
          Tip — save this reopen link as a bookmark. It survives a localStorage wipe and
          works on any device.
        </div>
      </div>

      {item.backend === "ctrng" && item.ctrng_key_b64 && (
        <div className="key-note">
          <span className="tag">key</span>
          K (256 bits) is held only in this browser's localStorage, never in the envelope.
          Sharing the envelope alone reveals nothing — but the reopen link does include K,
          so anyone who has the link can decrypt at unlock time. Treat it like a password.
        </div>
      )}

      {item.plaintext !== undefined && (
        <div className="plaintext-block">
          <div className="envelope-header">
            <span>plaintext</span>
          </div>
          <pre>{item.plaintext}</pre>
        </div>
      )}
    </section>
  );
}
