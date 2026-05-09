import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Compose, type SealOptions } from "./components/Compose";
import { Queue } from "./components/Queue";
import { Detail } from "./components/Detail";
import { Starfield } from "./components/Starfield";
import { WalletConnect } from "./components/WalletConnect";
import {
  getChainInfo,
  roundAtTime,
  timeAtRound,
  fetchRound,
  CHAIN_HASH,
} from "./lib/drand";
import { encrypt as drandEncrypt, decrypt as drandDecrypt } from "./lib/tlock";
import { pack as packDrand, unpack as unpackDrand } from "./lib/envelope";
import { packCtrng, unpackCtrng } from "./lib/envelope-ctrng";
import { fetchLatestBeacon, estimateTargetSequence } from "./lib/ctrng";
import { symSeal, symOpen, verifyCommitment } from "./lib/symmetric";
import { b64ToBytes, bytesToB64 } from "./lib/bytes";
import {
  loadQueue,
  saveQueue,
  newId,
  findByEnvelope,
  type QueueItem,
} from "./lib/queue";
import type { Backend } from "./lib/backend";
import {
  parseFragment,
  readKeyFragment,
  clearFragment,
  buildItemFromImport,
} from "./lib/share";
import {
  isNameStoneConfigured,
  generateCapsuleLabel,
  publishCapsule,
  fetchCapsuleByEns,
} from "./lib/namestone";

const POLL_MS = 2500;

export default function App() {
  const [items, setItems] = useState<QueueItem[]>(() => loadQueue());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [chainReady, setChainReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<{ address: string | null; ens: string | null }>({
    address: null,
    ens: null,
  });
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    saveQueue(items);
  }, [items]);

  useEffect(() => {
    getChainInfo()
      .then(() => setChainReady(true))
      .catch((e) => setBootError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Boot-time import: either #env=… (reopen link) or ?ens=<name> (ENS-resolved capsule).
  useEffect(() => {
    let cancelled = false;
    const ensParam = new URLSearchParams(window.location.search).get("ens");
    const fragmentImp = parseFragment();
    if (!ensParam && !fragmentImp) return;

    (async () => {
      try {
        let imp = fragmentImp;
        let capsuleEns: string | undefined;
        if (ensParam) {
          capsuleEns = ensParam;
          const records = await fetchCapsuleByEns(ensParam);
          if (!records) {
            throw new Error(`no envelope text record on ${ensParam}`);
          }
          imp = {
            envelope: records.envelope,
            createdAt: records.createdAt ?? Math.floor(Date.now() / 1000),
            // For cTRNG, the key isn't in the ENS records (privacy-by-design).
            // Look for it in the URL fragment (?ens=…#k=…). drand needs no key.
            ctrngKeyB64: readKeyFragment(),
          };
        }
        if (!imp) return;

        const draft = buildItemFromImport(imp, newId);
        let unlockUnix = draft.unlock_unix;
        if (draft.backend === "drand" && draft.round !== undefined) {
          const info = await getChainInfo();
          unlockUnix = timeAtRound(draft.round, info);
        }
        if (cancelled) return;
        const finalised: QueueItem = {
          ...draft,
          unlock_unix: unlockUnix,
          ...(capsuleEns ? { capsule_ens: capsuleEns } : {}),
        };
        setItems((prev) => {
          const existing = findByEnvelope(prev, finalised.envelope);
          if (existing) {
            setSelectedId(existing.id);
            return prev;
          }
          setSelectedId(finalised.id);
          return [...prev, finalised];
        });
      } catch (e) {
        setBootError(`failed to import shared envelope: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        clearFragment();
        // Strip ?ens= from the URL too.
        if (ensParam) {
          const url = new URL(window.location.href);
          url.searchParams.delete("ens");
          history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.unlock_unix - b.unlock_unix),
    [items],
  );

  const selected = useMemo(
    () => items.find((it) => it.id === selectedId) ?? null,
    [items, selectedId],
  );

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  // Phase-2 ENS subdomain publish. Runs in background after seal — non-blocking.
  // Silently no-ops if NameStone isn't configured.
  const publishToNameStone = useCallback(
    async (item: QueueItem, ownerAddress: string | null) => {
      if (!isNameStoneConfigured()) return;
      const label = generateCapsuleLabel();
      try {
        const records: Record<string, string> = {
          envelope: item.envelope,
          unlock_unix: String(item.unlock_unix),
          backend: item.backend,
          created_at: String(item.created_at),
        };
        if (item.sender_ens) records.sender_ens = item.sender_ens;
        if (item.recipient_ens) records.recipient_ens = item.recipient_ens;
        const fqn = await publishCapsule({
          label,
          ownerAddress,
          textRecords: records,
        });
        updateItem(item.id, { capsule_ens: fqn, capsule_publish_error: undefined });
      } catch (e) {
        updateItem(item.id, {
          capsule_publish_error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [updateItem],
  );

  const sealDrand = useCallback(
    async (message: string, unlockUnix: number, opts: SealOptions, senderEns: string | null) => {
      const info = await getChainInfo();
      const round = roundAtTime(unlockUnix, info);
      const actualUnlock = timeAtRound(round, info);
      const ct = await drandEncrypt(round, message);
      const envelope = packDrand(round, ct, {
        senderEns: senderEns ?? null,
        recipientEns: opts.recipientEns ?? null,
      });
      const item: QueueItem = {
        id: newId(),
        backend: "drand",
        envelope,
        round,
        unlock_unix: actualUnlock,
        created_at: Math.floor(Date.now() / 1000),
        status: "sealed",
        sender_ens: senderEns ?? undefined,
        recipient_ens: opts.recipientEns,
      };
      setItems((prev) => [...prev, item]);
      setSelectedId(item.id);
      // Background ENS publish — fire and forget.
      void publishToNameStone(item, identity.address);
    },
    [publishToNameStone, identity.address],
  );

  const sealCtrng = useCallback(
    async (message: string, unlockUnix: number, opts: SealOptions, senderEns: string | null) => {
      let targetSeq: number | undefined;
      try {
        const ref = await fetchLatestBeacon();
        targetSeq = estimateTargetSequence(unlockUnix, ref);
      } catch {
        targetSeq = undefined;
      }
      const sealed = await symSeal(message, unlockUnix);
      const envelope = packCtrng({
        unlockUnix,
        targetSequence: targetSeq,
        ct: sealed.ct,
        iv: sealed.iv,
        commit: sealed.commit,
        senderEns: senderEns ?? null,
        recipientEns: opts.recipientEns ?? null,
      });
      const item: QueueItem = {
        id: newId(),
        backend: "ctrng",
        envelope,
        unlock_unix: unlockUnix,
        created_at: Math.floor(Date.now() / 1000),
        status: "sealed",
        ctrng_key_b64: bytesToB64(sealed.key),
        ctrng_target_sequence: targetSeq,
        sender_ens: senderEns ?? undefined,
        recipient_ens: opts.recipientEns,
      };
      setItems((prev) => [...prev, item]);
      setSelectedId(item.id);
      void publishToNameStone(item, identity.address);
    },
    [publishToNameStone, identity.address],
  );

  const handleSeal = useCallback(
    async (message: string, unlockUnix: number, backend: Backend, opts: SealOptions) => {
      const sender = identity.ens;
      if (backend === "drand") return sealDrand(message, unlockUnix, opts, sender);
      return sealCtrng(message, unlockUnix, opts, sender);
    },
    [sealDrand, sealCtrng, identity.ens],
  );

  const tryUnsealDrand = useCallback(
    async (item: QueueItem) => {
      const round = item.round;
      if (round === undefined) {
        updateItem(item.id, { status: "error", error: "missing round" });
        return;
      }
      const sig = await fetchRound(round);
      if (!sig) {
        updateItem(item.id, { status: "ready", error: "drand catching up…" });
        return;
      }
      updateItem(item.id, { status: "unsealing", error: undefined });
      const { ct } = unpackDrand(item.envelope);
      const plaintext = await drandDecrypt(ct);
      updateItem(item.id, { status: "unsealed", plaintext, error: undefined });
    },
    [updateItem],
  );

  const tryUnsealCtrng = useCallback(
    async (item: QueueItem) => {
      if (!item.ctrng_key_b64) {
        updateItem(item.id, {
          status: "error",
          error: "key missing (sealed in another browser?)",
        });
        return;
      }
      const parsed = unpackCtrng(item.envelope);
      const witness = await fetchLatestBeacon();
      if (witness.timestamp < parsed.unlockUnix) {
        updateItem(item.id, {
          status: "ready",
          error: `cTRNG block ${witness.sequence} ts ${witness.timestamp} < unlock ${parsed.unlockUnix}`,
        });
        return;
      }
      updateItem(item.id, { status: "unsealing", error: undefined });
      const keyBytes = b64ToBytes(item.ctrng_key_b64);
      const ok = await verifyCommitment(parsed.commit, keyBytes, parsed.iv, parsed.unlockUnix);
      if (!ok) {
        updateItem(item.id, { status: "error", error: "commitment mismatch" });
        return;
      }
      const plaintext = await symOpen(parsed.ct, parsed.iv, keyBytes);
      updateItem(item.id, {
        status: "unsealed",
        plaintext,
        error: undefined,
        ctrng_witness_sequence: witness.sequence,
        ctrng_witness_timestamp: witness.timestamp,
        ctrng_witness_value: witness.ctrng[0],
        ctrng_witness_url: witness.source_url,
      });
    },
    [updateItem],
  );

  const tryUnseal = useCallback(
    async (item: QueueItem) => {
      if (inFlight.current.has(item.id)) return;
      inFlight.current.add(item.id);
      try {
        if (item.backend === "drand") await tryUnsealDrand(item);
        else await tryUnsealCtrng(item);
      } catch (e) {
        updateItem(item.id, {
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        inFlight.current.delete(item.id);
      }
    },
    [tryUnsealDrand, tryUnsealCtrng, updateItem],
  );

  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const tSec = t / 1000;
      for (const it of items) {
        if (it.status === "sealed" && it.unlock_unix <= tSec) {
          updateItem(it.id, { status: "ready" });
        }
        if (it.status === "ready" && it.unlock_unix <= tSec && !inFlight.current.has(it.id)) {
          void tryUnseal(it);
        }
      }
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, [items, tryUnseal, updateItem]);

  const handleUnseal = useCallback(
    (id: string) => {
      const it = items.find((x) => x.id === id);
      if (it) void tryUnseal(it);
    },
    [items, tryUnseal],
  );

  const handleDelete = useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((it) => it.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId],
  );

  return (
    <>
      <Starfield />
      <div className="app">
        <header className="site-header">
          <div className="header-left">
            <h1>
              Sealed Sky <span className="subtitle">cosmic timelock encryption</span>
            </h1>
            <div className="chain-info">
              drand quicknet · <code>{CHAIN_HASH.slice(0, 12)}…</code>
              {chainReady ? (
                <span className="ok"> ● online</span>
              ) : (
                <span className="warn"> ● connecting…</span>
              )}
              <span className="sep"> · </span>
              SpaceComputer cTRNG · <code>k2k4r8…09f</code>
            </div>
            {bootError && <div className="error">drand unreachable: {bootError}</div>}
          </div>
          <div className="header-right">
            <WalletConnect onIdentityChange={setIdentity} />
          </div>
        </header>
      <main>
        <div className="left-col">
          <Compose onSeal={handleSeal} disabled={!chainReady} senderEns={identity.ens} />
          <Queue
            items={sortedItems}
            selectedId={selectedId}
            now={now}
            onSelect={setSelectedId}
            onUnseal={handleUnseal}
            onDelete={handleDelete}
          />
        </div>
        <div className="right-col">
          <Detail item={selected} />
        </div>
      </main>
      <footer>
        <div className="credit">
          Built for <strong>ETH Prague 2026 Hackathon</strong> · Stardust Cartel
        </div>
        <div className="tagline">
          Two backends, one queue · drand timelock for non-interactive IBE · SpaceComputer cTRNG for commit-reveal with an orbital witness
        </div>
      </footer>
      </div>
    </>
  );
}
