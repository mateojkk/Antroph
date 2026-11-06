import { SuiGrpcClient } from "@mysten/sui/grpc";
import {
  SuiJsonRpcClient,
  type JsonRpcTransport,
} from "@mysten/sui/jsonRpc";

export type SuiNetwork = "mainnet" | "testnet" | "devnet";

const GRPC_BASE_URL: Record<SuiNetwork, string> = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
};

const grpcClients = new Map<SuiNetwork, SuiGrpcClient>();
const accountsTableIds = new Map<string, string>();

export function grpcClient(network: SuiNetwork): SuiGrpcClient {
  const existing = grpcClients.get(network);
  if (existing) return existing;
  const client = new SuiGrpcClient({
    network,
    baseUrl: GRPC_BASE_URL[network],
  });
  grpcClients.set(network, client);
  return client;
}

function addressBytes(address: string): Uint8Array {
  const hex = address.trim().toLowerCase().replace(/^0x/, "").padStart(64, "0").slice(0, 64);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isMissingDynamicField(err: unknown): boolean {
  const message = String(err).toLowerCase();
  return message.includes("not_found") || message.includes("not found");
}

/**
 * MemWalAccount ids live in the registry's `accounts` table, keyed by owner.
 * That table is current chain state. The old AccountCreated event scan only
 * sees Tatum's recent checkpoint window, so an older account looks missing and
 * create_account then aborts because the account already exists.
 */
export async function findMemWalAccountId(
  registryId: string,
  owner: string,
  network: SuiNetwork = "mainnet"
): Promise<string | null> {
  const client = grpcClient(network);
  let parentId = accountsTableIds.get(registryId);
  if (!parentId) {
    const response = await client.getObject({
      objectId: registryId,
      include: { json: true },
    });
    const json = response.object?.json as { accounts?: { id?: string } } | null | undefined;
    parentId = json?.accounts?.id;
    if (!parentId) return null;
    accountsTableIds.set(registryId, parentId);
  }

  try {
    const field = await client.getDynamicField({
      parentId,
      name: { type: "address", bcs: addressBytes(owner) },
    });
    const bcs = field.dynamicField?.value?.bcs;
    if (!bcs || bcs.length !== 32) return null;
    return `0x${bytesToHex(bcs)}`;
  } catch (err) {
    if (isMissingDynamicField(err)) return null;
    throw err;
  }
}

/**
 * dapp-kit still requires a SuiJsonRpcClient, but Sui Foundation turned JSON-RPC
 * off on public fullnodes in July 2026. Those hosts answer the browser preflight
 * with no Access-Control-Allow-Origin, so Chrome reports a CORS failure.
 *
 * Name lookup and transaction building go through the gRPC-web fullnode, which
 * allows browser origins. The JSON-RPC transport only stays so dapp-kit can
 * construct the client; it never calls the sunset JSON-RPC URL.
 */
export function createBrowserSuiClient(network: SuiNetwork): SuiJsonRpcClient {
  const grpc = grpcClient(network);

  const transport: JsonRpcTransport = {
    async request<T = unknown>(input: { method: string; params: unknown[] }): Promise<T> {
      if (input.method === "suix_resolveNameServiceNames") {
        const address = typeof input.params[0] === "string" ? input.params[0] : "";
        if (!address) {
          return { data: [], hasNextPage: false, nextCursor: null } as T;
        }
        try {
          const { data } = await grpc.core.defaultNameServiceName({ address });
          return {
            data: data.name ? [data.name] : [],
            hasNextPage: false,
            nextCursor: null,
          } as T;
        } catch {
          return { data: [], hasNextPage: false, nextCursor: null } as T;
        }
      }

      if (input.method === "suix_resolveNameServiceAddress") {
        return null as T;
      }

      throw new Error(
        `Sui JSON-RPC ${input.method} is unavailable. Public fullnodes no longer serve JSON-RPC.`
      );
    },
  };

  const client = new SuiJsonRpcClient({ network, transport });
  client.core = grpc.core as unknown as typeof client.core;
  return client;
}
