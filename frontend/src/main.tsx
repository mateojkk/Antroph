import React from "react";
import ReactDOM from "react-dom/client";
import { createDAppKit } from "@mysten/dapp-kit-core";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import { grpcClient, type SuiNetwork } from "./lib/suiClient";

const network = (import.meta.env.VITE_SUI_NETWORK ?? "mainnet") as SuiNetwork;

const dAppKit = createDAppKit({
  networks: [network],
  defaultNetwork: network,
  createClient: (name) => grpcClient(name as SuiNetwork),
  storageKey: "antroph-dappkit",
  slushWalletConfig: { appName: "Antroph" },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <DAppKitProvider dAppKit={dAppKit}>
        <App />
      </DAppKitProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
