import { useCallback, useMemo, useState } from "react";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { createAccount, addDelegateKey } from "@mysten-incubation/memwal/account";
import type { Transaction } from "@mysten/sui/transactions";
import { apiGet, apiPatch, apiPost } from "../lib/api";
import { findMemWalAccountId, grpcClient, type SuiNetwork } from "../lib/suiClient";
import { useAuth } from "./useAuth";

const SUI_NETWORK = (import.meta.env.VITE_SUI_NETWORK ?? "mainnet") as SuiNetwork;
/** MemWal account SDK only documents mainnet and testnet. */
const MEMWAL_NETWORK: "mainnet" | "testnet" =
  SUI_NETWORK === "testnet" ? "testnet" : "mainnet";

function transactionDigest(result: unknown): string {
  if (result && typeof result === "object" && "digest" in result) {
    const digest = (result as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest) return digest;
  }
  if (result && typeof result === "object" && "Transaction" in result) {
    const inner = (result as { Transaction?: { digest?: string } }).Transaction;
    if (inner?.digest) return inner.digest;
  }
  return "";
}

function accountKey(address: string) {
  return `vela_memwal_account_${address}`;
}

function authorizedKey(address: string) {
  return `vela_memwal_server_authorized_${address}`;
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
  address: string,
  registryId: string
): Promise<string | null> {
  // A failed lookup must stop setup rather than trigger duplicate creation.
  return findMemWalAccountId(registryId, address, SUI_NETWORK);
}

export interface UseMemWalResult {
  memwal: null;
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
  const dAppKit = useDAppKit();
  const chainClient = useMemo(() => grpcClient(SUI_NETWORK), []);
  const { user } = useAuth();

  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const [grants, setGrants] = useState<Record<string, boolean>>({});
  const accountId = address
    ? accounts[address] ?? loadAccountId(address) ?? user?.memwal_account_id ?? null
    : null;
  const authorized = address && accountId
    ? grants[address] ?? (isMarkedAuthorized(address) ? true : null)
    : null;
  const setAccountId = useCallback((id: string) => {
    if (address) setAccounts((previous) => ({ ...previous, [address]: id }));
  }, [address]);
  const setAuthorized = useCallback((value: boolean) => {
    if (address) setGrants((previous) => ({ ...previous, [address]: value }));
  }, [address]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const walletSigner = useMemo(() => {
    if (!address) return null;
    return {
      address,
      signAndExecuteTransaction: async ({
        transaction,
      }: {
        transaction: Transaction;
      }) => {
        const result = await dAppKit.signAndExecuteTransaction({
          transaction: transaction as never,
        });
        const digest = transactionDigest(result);
        if (!digest) {
          throw new Error("Wallet did not return a transaction digest");
        }
        return { digest };
      },
    };
  }, [address, dAppKit]);

  const authorize = useCallback(async () => {
    if (!address) {
      setError("Wallet not connected");
      return;
    }
    if (!walletSigner) {
      setError("Wallet signer not ready");
      return;
    }
    setLoading(true);
    setError(null);
    setStatus("Looking up your Walrus Memory account...");

    try {
      const [{ packageId, registryId }, setup] = await Promise.all([
        apiGet<{ packageId: string; registryId: string }>("/book/deployment"),
        apiGet<{ accountId: string | null; hasDelegate: boolean }>("/book/status"),
      ]);
      let currentAccountId = setup.accountId ?? loadAccountId(address);
      if (setup.accountId && setup.hasDelegate) {
        saveAccountId(address, setup.accountId);
        setAccountId(setup.accountId);
        markAuthorized(address, true);
        setAuthorized(true);
        setStatus(null);
        return;
      }

      if (!currentAccountId) {
        currentAccountId = await findExistingAccount(address, registryId);
        if (currentAccountId && address) {
          saveAccountId(address, currentAccountId);
          setAccountId(currentAccountId);
        }
      }

      if (!currentAccountId) {
        setStatus("Creating your Walrus Memory account...");
        try {
          const created = await createAccount({
            packageId,
            registryId,
            // The SDK type also requires message signing for unrelated manual APIs.
            walletSigner: walletSigner as never,
            suiClient: chainClient as never,
            suiNetwork: MEMWAL_NETWORK,
          });
          currentAccountId = created.accountId;
          if (currentAccountId && address) {
            saveAccountId(address, currentAccountId);
            setAccountId(currentAccountId);
          }
        } catch (createErr) {
          if (isAccountAlreadyExistsError(createErr)) {
            // Another request may have created the account after the lookup.
            currentAccountId = await findExistingAccount(address, registryId);
            if (!currentAccountId) {
              throw new Error(
                "An account already exists for this wallet, but Antroph could not discover its ID. " +
                  "Check your account on https://memory.walrus.xyz and retry.",
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

      setStatus("Authorizing Antroph...");
      const { publicKey } = await apiGet<{ publicKey: string }>("/book/delegate-key");
      try {
        await addDelegateKey({
          packageId,
          registryId,
          accountId: currentAccountId,
          publicKey,
          label: "Antroph",
          walletSigner: walletSigner as never,
          suiClient: chainClient as never,
          suiNetwork: MEMWAL_NETWORK,
        });
      } catch (grantErr) {
        if (!/abort code:\s*0\b/.test(grantErr instanceof Error ? grantErr.message : String(grantErr))) {
          throw grantErr;
        }
      }

      // Server memory calls resolve the account from the profile, so persist it
      // before declaring setup complete. Retrying an existing grant is safe.
      await apiPatch("/profile", {
        email: address,
        memwal_account_id: currentAccountId,
      });
      markAuthorized(address, true);
      setAuthorized(true);
      setStatus(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [address, walletSigner, chainClient, setAccountId, setAuthorized]);

  const remember = useCallback(
    async (text: string) => {
      if (!accountId) throw new Error("MemWal not ready");
      return apiPost("/book/remember", { text });
    },
    [accountId]
  );

  const rememberAndWait = useCallback(
    async (text: string) => remember(text),
    [remember]
  );

  const recall = useCallback(
    async (query: string, options?: { limit?: number; maxDistance?: number }) => {
      if (!accountId) throw new Error("MemWal not ready");
      const result = await apiPost<{
        results?: Array<{ text: string; distance: number; blob_id: string }>;
        total?: number;
      }>("/book/recall", { query, limit: options?.limit });
      return {
        results: result?.results ?? [],
        total: result?.total ?? result?.results?.length ?? 0,
      };
    },
    [accountId]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    memwal: null,
    delegateAddress: null,
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
