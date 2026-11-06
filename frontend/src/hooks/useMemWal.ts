import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
} from "@mysten/dapp-kit";
import { MemWal } from "@mysten-incubation/memwal";
import {
  createAccount,
  generateDelegateKey,
} from "@mysten-incubation/memwal/account";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { apiGet, apiPatch, apiPost } from "../lib/api";
import { findMemWalAccountId } from "../lib/suiClient";
import { useAuth } from "./useAuth";

// Always route MemWal requests through our own backend proxy (/api/memwal).
// The upstream relayer (relayer.memory.walrus.xyz) doesn't return
// Access-Control-Allow-Origin on CORS preflights, so the browser blocks
// direct requests with "Failed to fetch".  The proxy forwards the signed
// MemWal headers unchanged so the relayer's auth still works.
//
// VITE_MEMWAL_SERVER_URL is intentionally ignored here — it pointed directly
// at the relayer and bypassed the proxy, re-introducing the CORS failure.
const SUI_CLOCK =
  "0x0000000000000000000000000000000000000000000000000000000000000006";
const SERVER_URL = `${window.location.origin}/api/memwal`;
const PACKAGE_ID = import.meta.env.VITE_MEMWAL_PACKAGE_ID;
const REGISTRY_ID = import.meta.env.VITE_MEMWAL_REGISTRY_ID;

interface StoredDelegate {
  privateKey: string;
  publicKey: string;
  suiAddress: string;
}

function delegateKey(address: string) {
  return `vela_memwal_delegate_${address}`;
}

function accountKey(address: string) {
  return `vela_memwal_account_${address}`;
}

function authorizedKey(address: string) {
  return `vela_memwal_authorized_${address}`;
}

function loadDelegate(address: string): StoredDelegate | null {
  const raw = localStorage.getItem(delegateKey(address));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredDelegate;
  } catch {
    return null;
  }
}

function saveDelegate(address: string, delegate: StoredDelegate) {
  localStorage.setItem(delegateKey(address), JSON.stringify(delegate));
}

function loadAccountId(address: string): string | null {
  return localStorage.getItem(accountKey(address));
}

function saveAccountId(address: string, accountId: string) {
  localStorage.setItem(accountKey(address), accountId);
}

function isMarkedAuthorized(address: string): boolean {
  return localStorage.getItem(authorizedKey(address)) === "true";
}

function markAuthorized(address: string, value: boolean) {
  if (value) {
    localStorage.setItem(authorizedKey(address), "true");
  } else {
    localStorage.removeItem(authorizedKey(address));
  }
}

async function getOrCreateDelegate(address: string): Promise<StoredDelegate> {
  const existing = loadDelegate(address);
  if (existing) return existing;
  const delegate = await generateDelegateKey();
  const stored: StoredDelegate = {
    privateKey: delegate.privateKey,
    publicKey: bytesToHex(delegate.publicKey),
    suiAddress: delegate.suiAddress,
  };
  saveDelegate(address, stored);
  return stored;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

function isAuthError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("unauthorized") ||
    msg.includes("delegate") ||
    msg.includes("permission") ||
    msg.includes("not authorized") ||
    msg.includes("invalid signature")
  );
}

function isAccountAlreadyExistsError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("eaccountalreadyexists") ||
    msg.includes("account already exists") ||
    msg.includes("abort code: 3")
  );
}

/**
 * Discover an existing MemWalAccount for a wallet. The account is a shared
 * object, so it has no Sui owner. Read it from the registry's accounts table
 * the same way People Book does. The event scan only sees a recent checkpoint
 * window, so an older account looks missing even though create_account aborts.
 */
async function findExistingAccount(
  packageId: string,
  address: string
): Promise<string | null> {
  if (REGISTRY_ID) {
    try {
      const fromRegistry = await findMemWalAccountId(REGISTRY_ID, address);
      if (fromRegistry) return fromRegistry;
    } catch {
      // Registry read failed. Fall through to the event scan.
    }
  }

  try {
    const result = await apiGet<{ found?: boolean; account_id?: string | null }>(
      `/sui/account?address=${encodeURIComponent(address)}&package=${encodeURIComponent(packageId)}`
    );
    return result?.account_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Minimal Sui client for the MemWal SDK. The SDK only uses
 * `waitForTransaction()` after the wallet signs; route that through our
 * Tatum-backed /api/sui/tx endpoint instead of the dead JSON-RPC fullnode.
 */
function memwalTxClient(): SuiJsonRpcClient {
  return {
    waitForTransaction: async ({ digest }: { digest: string }) => {
      const deadline = Date.now() + 90_000;
      let lastError: unknown = null;
      while (Date.now() < deadline) {
        try {
          const tx = await apiGet<{
            digest: string;
            effects?: { status?: { status?: string } };
          }>(`/sui/tx?digest=${encodeURIComponent(digest)}`);
          if (tx?.digest) {
            if (tx.effects?.status?.status === "failure") {
              throw new Error(`Transaction ${digest} failed on mainnet`);
            }
            return tx;
          }
        } catch (err) {
          // 404 while the gateway hasn't indexed the tx yet: keep polling.
          lastError = err;
        }
        await new Promise((resolve) => setTimeout(resolve, 1_500));
      }
      throw lastError instanceof Error
        ? lastError
        : new Error(`Timed out waiting for transaction ${digest}`);
    },
  } as unknown as SuiJsonRpcClient;
}

export interface UseMemWalResult {
  memwal: MemWal | null;
  delegateAddress: string | null;
  accountId: string | null;
  authorized: boolean | null;
  loading: boolean;
  status: string | null;
  error: string | null;
  authorize: () => Promise<void>;
  remember: (text: string) => Promise<unknown>;
  rememberAndWait: (text: string, timeoutMs?: number) => Promise<unknown>;
  recall: (
    query: string,
    options?: { limit?: number; maxDistance?: number }
  ) => Promise<{ results: Array<{ text: string; distance: number; blob_id: string }>; total: number }>;
  clearError: () => void;
}

export function useMemWal(): UseMemWalResult {
  const account = useCurrentAccount();
  const address = account?.address;
  // The wallet signs; Vela broadcasts through Tatum GraphQL. This keeps the
  // browser off Sui's sunset public JSON-RPC fullnode (and its CORS block).
  const txClient = useMemo(memwalTxClient, []);
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction({
    execute: async ({ bytes, signature }) => {
      const result = await apiPost<{ digest?: string; error?: string }>(
        "/sui/execute",
        { bytes, signature }
      );
      if (!result?.digest) {
        throw new Error(result?.error ?? "Tatum returned no transaction digest");
      }
      return { digest: result.digest };
    },
  });
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { user } = useAuth();

  const [delegate, setDelegate] = useState<StoredDelegate | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    getOrCreateDelegate(address).then((d) => {
      if (cancelled) return;
      setDelegate(d);

      // Prefer localStorage, fall back to Supabase profile, then write back to localStorage.
      let storedAccountId = loadAccountId(address);
      if (!storedAccountId && user?.memwal_account_id) {
        storedAccountId = user.memwal_account_id;
        saveAccountId(address, storedAccountId);
      }
      setAccountId(storedAccountId);

      // Only consider ourselves authorized if the localStorage flag, delegate key,
      // and account ID are all present. Otherwise force re-authorization.
      const marked = isMarkedAuthorized(address);
      const canAuthorize = !!(storedAccountId && d);
      setAuthorized(marked && canAuthorize ? true : marked ? false : null);
    });
    return () => {
      cancelled = true;
    };
  }, [address, user?.memwal_account_id]);

  const memwal = useMemo(() => {
    if (!delegate || !accountId) return null;
    return MemWal.create({
      key: delegate.privateKey,
      accountId,
      serverUrl: SERVER_URL,
      namespace: address ?? "default",
    });
  }, [delegate, accountId, address]);

  const walletSigner = useMemo(() => {
    if (!address) return null;
    return {
      address,
      signAndExecuteTransaction: async ({
        transaction,
      }: {
        transaction: Transaction;
      }) => {
        return signAndExecuteTransaction({ transaction });
      },
      signPersonalMessage: async ({ message }: { message: Uint8Array }) => {
        return signPersonalMessage({ message });
      },
    };
  }, [address, signAndExecuteTransaction, signPersonalMessage]);

  const authorize = useCallback(async () => {
    if (!address) {
      setError("Wallet not connected");
      return;
    }
    if (!delegate) {
      setError("Delegate key not ready");
      return;
    }
    if (!walletSigner) {
      setError("Wallet signer not ready");
      return;
    }
    if (!txClient) {
      setError("Sui client not ready");
      return;
    }
    if (!SERVER_URL) {
      // SERVER_URL has a built-in fallback; this branch is unreachable in
      // normal operation but kept as a safety net.
      setError("MemWal server URL not configured.");
      return;
    }
    if (!PACKAGE_ID) {
      setError(
        `VITE_MEMWAL_PACKAGE_ID is not set (value: ${typeof import.meta.env.VITE_MEMWAL_PACKAGE_ID}). Redeploy after setting env vars.`
      );
      return;
    }
    if (!REGISTRY_ID) {
      setError(
        `VITE_MEMWAL_REGISTRY_ID is not set (value: ${typeof import.meta.env.VITE_MEMWAL_REGISTRY_ID}). Redeploy after setting env vars.`
      );
      return;
    }

    setLoading(true);
    setError(null);
    setStatus("Looking up your Walrus Memory account…");

    try {
      let currentAccountId = loadAccountId(address);

      if (!currentAccountId) {
        currentAccountId = await findExistingAccount(PACKAGE_ID, address);
        if (currentAccountId && address) {
          saveAccountId(address, currentAccountId);
          setAccountId(currentAccountId);
        }
      }

      if (!currentAccountId) {
        setStatus("Creating your Walrus Memory account…");
        try {
          const created = await createAccount({
            packageId: PACKAGE_ID,
            registryId: REGISTRY_ID,
            walletSigner,
            suiClient: txClient,
          });
          currentAccountId = created.accountId;
          if (currentAccountId && address) {
            saveAccountId(address, currentAccountId);
            setAccountId(currentAccountId);
          }
        } catch (createErr) {
          if (isAccountAlreadyExistsError(createErr)) {
            // Account was created between our event scan and the create call.
            // Re-scan to pick it up.
            currentAccountId = await findExistingAccount(PACKAGE_ID, address);
            if (!currentAccountId) {
              throw new Error(
                "An account already exists for this wallet, but Antroph could not discover its ID. " +
                  "Please create a fresh wallet or check your account on https://memory.walrus.xyz.",
                { cause: createErr }
              );
            }
            if (address) {
              saveAccountId(address, currentAccountId);
              setAccountId(currentAccountId);
            }
          } else {
            throw createErr;
          }
        }
      }

      if (!currentAccountId) {
        throw new Error("Could not create or find a Walrus Memory account.");
      }

      setStatus("Authorizing this device…");
      const pkBytes = hexToBytes(delegate.publicKey);
      // The published contract is add_delegate_key(account, registry, key, label, clock).
      // memwal 0.0.7 still passes the key as the second argument, which the chain
      // rejects as InvalidUsageOfPureArg.
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::account::add_delegate_key`,
        arguments: [
          tx.object(currentAccountId),
          tx.object(REGISTRY_ID),
          tx.pure.vector("u8", Array.from(pkBytes)),
          tx.pure.string(`Antroph ${address.slice(0, 8)}`),
          tx.object(SUI_CLOCK),
        ],
      });
      await walletSigner.signAndExecuteTransaction({ transaction: tx });

      setAuthorized(true);
      if (address) {
        markAuthorized(address, true);
        // Persist to Supabase so the account ID survives browser changes.
        try {
          await apiPatch("/profile", {
            email: address,
            memwal_account_id: currentAccountId,
          });
        } catch (persistErr) {
          // localStorage already has the account ID; a profile sync failure is non-fatal here.
          console.warn("Failed to persist MemWal account ID to profile:", persistErr);
        }
      }
      setStatus(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [address, delegate, walletSigner, txClient]);

  const remember = useCallback(
    async (text: string) => {
      if (!memwal) throw new Error("MemWal not ready");
      try {
        const result = await memwal.remember(text);
        if (address) markAuthorized(address, true);
        setAuthorized(true);
        return result;
      } catch (err) {
        if (isAuthError(err) && address) {
          markAuthorized(address, false);
          setAuthorized(false);
        }
        throw err;
      }
    },
    [memwal, address]
  );

  const rememberAndWait = useCallback(
    async (text: string, timeoutMs = 15_000) => {
      if (!memwal) throw new Error("MemWal not ready");
      try {
        const result = await memwal.rememberAndWait(text, undefined, { timeoutMs });
        if (address) markAuthorized(address, true);
        setAuthorized(true);
        return result;
      } catch (err) {
        if (isAuthError(err) && address) {
          markAuthorized(address, false);
          setAuthorized(false);
        }
        throw err;
      }
    },
    [memwal, address]
  );

  const recall = useCallback(
    async (query: string, options?: { limit?: number; maxDistance?: number }) => {
      if (!memwal) throw new Error("MemWal not ready");
      try {
        const result = await memwal.recall(query, options);
        if (address) markAuthorized(address, true);
        setAuthorized(true);
        return result as {
          results: Array<{ text: string; distance: number; blob_id: string }>;
          total: number;
        };
      } catch (err) {
        if (isAuthError(err) && address) {
          markAuthorized(address, false);
          setAuthorized(false);
        }
        throw err;
      }
    },
    [memwal, address]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    memwal,
    delegateAddress: delegate?.suiAddress ?? null,
    accountId,
    authorized,
    loading,
    status,
    error,
    authorize,
    remember,
    rememberAndWait,
    recall,
    clearError,
  };
}
