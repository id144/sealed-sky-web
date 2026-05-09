import { useEffect, useState } from "react";
import { useWallet, shortAddr } from "../lib/wallet";
import { lookupEnsName } from "../lib/ens";
import { lookupNameViaNameStone } from "../lib/namestone";

interface Props {
  onIdentityChange: (identity: { address: string | null; ens: string | null }) => void;
}

/**
 * Resolve a name for an address. Two-stage:
 *   1. Standard on-chain ENS reverse record (only set if the user did so via
 *      the ENS app — uncommon for NameStone-issued names).
 *   2. NameStone fallback: ask their API which names in our parent domain
 *      are registered to this address.
 */
async function discoverPrimaryName(address: `0x${string}`): Promise<string | null> {
  const onChain = await lookupEnsName(address);
  if (onChain) return onChain;
  const ns = await lookupNameViaNameStone(address);
  if (ns) return ns;
  return null;
}

export function WalletConnect({ onIdentityChange }: Props) {
  const wallet = useWallet();
  const [ens, setEns] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!wallet.address) {
      setEns(null);
      onIdentityChange({ address: null, ens: null });
      return;
    }
    setResolving(true);
    let cancelled = false;
    discoverPrimaryName(wallet.address)
      .then((name) => {
        if (cancelled) return;
        setEns(name);
        onIdentityChange({ address: wallet.address, ens: name });
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet.address, onIdentityChange]);

  if (!wallet.installed) {
    return (
      <div className="wallet-bar">
        <span className="wallet-no-provider">
          No wallet detected — install <a href="https://metamask.io" target="_blank" rel="noreferrer">MetaMask</a> or <a href="https://rabby.io" target="_blank" rel="noreferrer">Rabby</a> for ENS features.
        </span>
      </div>
    );
  }

  if (!wallet.address) {
    return (
      <div className="wallet-bar">
        <button
          className="wallet-connect-btn"
          onClick={wallet.connect}
          disabled={wallet.connecting}
        >
          {wallet.connecting ? "Connecting…" : "Connect wallet"}
        </button>
        {wallet.error && <span className="error inline">{wallet.error}</span>}
      </div>
    );
  }

  return (
    <div className="wallet-bar connected">
      <span className="wallet-tag">sealed by</span>
      <span className="wallet-name">
        {resolving ? "…" : ens ?? shortAddr(wallet.address)}
      </span>
      {ens && <span className="wallet-addr">{shortAddr(wallet.address)}</span>}
      <button className="ghost wallet-disconnect" onClick={wallet.disconnect}>
        disconnect
      </button>
    </div>
  );
}
