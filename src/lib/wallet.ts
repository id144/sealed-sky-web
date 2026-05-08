import { useCallback, useEffect, useState } from "react";

type Hex = `0x${string}`;

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export interface WalletState {
  address: Hex | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  installed: boolean;
}

const STORAGE_KEY = "sealed-sky.wallet.preferred";

function readPreferred(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writePreferred(on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function asHex(s: unknown): Hex | null {
  return typeof s === "string" && /^0x[0-9a-fA-F]+$/.test(s) ? (s as Hex) : null;
}

function asChainId(s: unknown): number | null {
  if (typeof s === "string" && /^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s, 16);
  if (typeof s === "number") return s;
  return null;
}

export function useWallet(): WalletState & {
  connect: () => Promise<void>;
  disconnect: () => void;
} {
  const installed = typeof window !== "undefined" && !!window.ethereum;

  const [state, setState] = useState<WalletState>(() => ({
    address: null,
    chainId: null,
    connecting: false,
    error: null,
    installed,
  }));

  // Reconnect silently if user previously connected.
  useEffect(() => {
    if (!installed || !readPreferred()) return;
    const prov = window.ethereum!;
    let cancelled = false;
    (async () => {
      try {
        const accs = (await prov.request({ method: "eth_accounts" })) as unknown[];
        const chainHex = await prov.request({ method: "eth_chainId" });
        const addr = Array.isArray(accs) && accs[0] ? asHex(accs[0]) : null;
        if (cancelled) return;
        setState((s) => ({ ...s, address: addr, chainId: asChainId(chainHex) }));
      } catch {
        // silent — user can click connect again
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [installed]);

  // Subscribe to provider events.
  useEffect(() => {
    if (!installed) return;
    const prov = window.ethereum!;
    const onAccounts = (...args: unknown[]) => {
      const accs = args[0] as unknown[] | undefined;
      const addr = Array.isArray(accs) && accs[0] ? asHex(accs[0]) : null;
      setState((s) => ({ ...s, address: addr }));
      if (!addr) writePreferred(false);
    };
    const onChain = (...args: unknown[]) => {
      setState((s) => ({ ...s, chainId: asChainId(args[0]) }));
    };
    prov.on?.("accountsChanged", onAccounts);
    prov.on?.("chainChanged", onChain);
    return () => {
      prov.removeListener?.("accountsChanged", onAccounts);
      prov.removeListener?.("chainChanged", onChain);
    };
  }, [installed]);

  const connect = useCallback(async () => {
    if (!installed) {
      setState((s) => ({
        ...s,
        error: "No injected wallet detected. Install MetaMask, Rabby, or similar.",
      }));
      return;
    }
    setState((s) => ({ ...s, connecting: true, error: null }));
    try {
      const prov = window.ethereum!;
      const accs = (await prov.request({ method: "eth_requestAccounts" })) as unknown[];
      const chainHex = await prov.request({ method: "eth_chainId" });
      const addr = Array.isArray(accs) && accs[0] ? asHex(accs[0]) : null;
      writePreferred(!!addr);
      setState({
        address: addr,
        chainId: asChainId(chainHex),
        connecting: false,
        error: null,
        installed: true,
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        connecting: false,
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }, [installed]);

  const disconnect = useCallback(() => {
    writePreferred(false);
    setState({
      address: null,
      chainId: null,
      connecting: false,
      error: null,
      installed,
    });
  }, [installed]);

  return { ...state, connect, disconnect };
}

export function shortAddr(a: Hex | null): string {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
